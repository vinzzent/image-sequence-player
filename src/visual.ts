"use strict";

import powerbi from "powerbi-visuals-api";
import { select as d3Select, Selection } from "d3-selection";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { ITooltipServiceWrapper, createTooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import { VisualFormattingSettingsModel } from "./settings";
import { Renderer } from "./renderVisual";

import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import DataView = powerbi.DataView;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;

import "./../style/visual.less";

type Formatter = ReturnType<typeof valueFormatter.create>;

// --- Interfaces ---
interface ImageFrame {
    identity: ISelectionId;
    imageUri: string;
    caption: string;
    tooltips: VisualTooltipDataItem[];
    opacity: number;
}

interface Formatters {
    forCategory: Formatter;
    forValue: Formatter;
    forTooltips: Formatter[];
}

export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private colorPalette: ISandboxExtendedColorPalette;
    private isHighContrast: boolean;
    private selectionManager: ISelectionManager;
    private target: HTMLElement;
    private imageFrames: ImageFrame[];
    private formattingSettingsService: FormattingSettingsService;
    private visualSettings: VisualFormattingSettingsModel;
    private rootElement: d3.Selection<HTMLDivElement, any, any, any>;
    private contentContainer: d3.Selection<HTMLDivElement, any, any, any>;
    private imageContainer: d3.Selection<HTMLDivElement, any, any, any>;
    private captionContainer: d3.Selection<HTMLDivElement, any, any, any>;
    private currentImageElement: d3.Selection<HTMLImageElement, any, any, any>;
    private nextImageElement: d3.Selection<HTMLImageElement, any, any, any>;
    private controlsWrapper: d3.Selection<HTMLDivElement, any, any, any>;
    private progressIndicator: d3.Selection<HTMLDivElement, any, any, any>;
    private isDataValid: boolean = false;
    private renderer: Renderer;
    private formatters: Formatters;
    private tooltipServiceWrapper: ITooltipServiceWrapper;
    private static readonly INVALID_MESSAGE: string = "Please add data to \n [Category] \n and \n [Image] \n fields.";
    private static readonly BLOCK_EXTERNAL_URLS: boolean = false;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.colorPalette = options.host.colorPalette;
        this.isHighContrast = options.host.colorPalette.isHighContrast;
        this.selectionManager = this.host.createSelectionManager();
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();
        this.rootElement = d3Select(this.target).append("div").classed("image-sequence-player", true);
        this.rootElement.classed("highcontrast", this.isHighContrast);
        this.contentContainer = this.rootElement.append("div").classed("content-container", true);
        this.captionContainer = this.contentContainer.append("div").classed("caption-container", true);
        this.imageContainer = this.contentContainer.append("div").classed("image-container", true);
        this.progressIndicator = this.rootElement.append("div").classed("progress-indicator", true);
        this.controlsWrapper = this.rootElement.append("div").classed("controls-wrapper", true);
        this.currentImageElement = this.imageContainer.append("img").attr("alt", "Image Frame 1").classed("active", true);
        this.nextImageElement = this.imageContainer.append("img").attr("alt", "Image Frame 2").classed("standby", true);
        this.imageFrames = [];
        this.tooltipServiceWrapper = createTooltipServiceWrapper(
            options.host.tooltipService,
            options.element
        );
        this.renderer = new Renderer({
            selectionManager: this.selectionManager,
            controlsWrapper: this.controlsWrapper,
            progressIndicator: this.progressIndicator,
            imageContainer: this.imageContainer,
            captionContainer: this.captionContainer,
            currentImageElement: this.currentImageElement,
            nextImageElement: this.nextImageElement,
            tooltipServiceWrapper: this.tooltipServiceWrapper
        });

        //this.setupControls();
    }

    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options);
        const dataView = options.dataViews && options.dataViews[0];
        this.visualSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);

        // Validate the incoming data
        this.isDataValid = this.isDataViewValid(dataView);

        // Get the view model (either real or placeholder)
        if (this.isDataValid) {
            this.imageFrames = this.transformDataViewToFrames(dataView);
        } else {
            this.imageFrames = this.createAwaitingDataFrames();
        }        

        // --- Centralized UI State Logic ---
        if (this.isDataValid) {
            this.moveLabelContainer(this.visualSettings.captionCard.position.value.value as "top" | "bottom");
            this.moveProgressIndicator(this.visualSettings.navigationCard.position.value.value as "top" | "bottom");
            this.updateStyling(this.visualSettings);
        } else {
            this.defaultStyling()
        }

        this.renderer.render(this.imageFrames, this.visualSettings);

        this.events.renderingFinished(options);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.visualSettings);
    }

    private static createPlaceholderSvg(message: string): string {
        const textStyle = `font-family: 'Segoe UI', sans-serif; font-size: 14px; fill: #666666;`;

        const textLines = message.split("\n").map((line, index) =>
            `<tspan x="50%" dy="${index === 0 ? '-0.5em' : '1.2em'}">${line}</tspan>`
        ).join("");

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
                    <text x="50%" y="50%" text-anchor="middle" style="${textStyle}">
                        ${textLines}
                    </text>
                 </svg>`;

        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }

    private isDataViewValid(dataView: DataView): boolean {
        const categorical = dataView && dataView.categorical;
        if (!categorical || !categorical.categories || !categorical.values) {
            return false;
        }

        const sequenceData = categorical.categories[0];
        const imageData = categorical.values.find(v => v.source.roles["imageUri"]);

        if (!sequenceData || !sequenceData.values || sequenceData.values.length === 0 || !imageData) {
            return false;
        }

        return true; // If all checks pass, the data is valid
    }

    /**
  * Transforms the dataView into an array of ImageFrame objects.
  * Each frame represents an image with its associated data.
  * The caption and tooltip for each frame are dynamically determined based on the visual's format settings.
  *
  * @param dataView The DataView object provided by Power BI.
  * @returns An array of ImageFrame objects.
  */
    private transformDataViewToFrames(dataView: DataView): ImageFrame[] {
        const categorical = dataView.categorical;
        console.log(categorical);
        const categories = categorical.categories.find(c => c.source.roles?.["category"]);
        const categoryFormat = categories?.source?.format;

        const valuesData = categorical.values.find(v => v.source.roles?.["value"]);
        const valueFormat = valuesData?.source?.format;

        const tooltipData = categorical.values.filter(v => v.source.roles?.["tooltips"]);
        const tooltipFormats = tooltipData?.map(v => v.source?.format) || [];

        const imageData = categorical.values.find(v => v.source.roles?.["imageUri"]);

        this.formatters = {
            forCategory: categories ? valueFormatter.create({ format: categoryFormat }) : undefined,
            forValue: valuesData ? valueFormatter.create({ format: valueFormat }) : undefined,
            forTooltips: tooltipFormats.map(f => valueFormatter.create({ format: f }))
        };

        if (!categories?.values || !imageData?.values) {
            return [];
        }

        const imageHighlights = imageData?.highlights;
        const isAnyHighlightActive = imageHighlights !== undefined;

        const frames: ImageFrame[] = [];
        const captionsEnabled = this.visualSettings.captionCard.show.value;
        const captionType = this.visualSettings.captionCard.type.value.value as string;

        for (let i = 0; i < categories.values.length; i++) {
            const identity = this.host.createSelectionIdBuilder()
                .withCategory(categories, i)
                .createSelectionId();

            // --- Only image highlight logic ---
            let opacity = 1.0;
            if (isAnyHighlightActive) {
                const highlightVal = imageHighlights ? imageHighlights[i] : null;
                if (highlightVal === null || highlightVal === "") {
                    opacity = 0.2; // Dimmed when not highlighted
                }
            }

            let captionText = '';
            const tooltipItems: VisualTooltipDataItem[] = [];

            const categoryRaw = categories.values[i];
            const formattedCategory = this.formatters.forCategory
                ? this.formatters.forCategory.format(categoryRaw)
                : String(categoryRaw);
            tooltipItems.push({ displayName: categories.source.displayName, value: formattedCategory });

            let formattedValue = '';
            if (valuesData) {
                const valueRaw = valuesData.values[i];
                formattedValue = this.formatters.forValue && valueRaw !== undefined
                    ? this.formatters.forValue.format(valueRaw)
                    : valueRaw !== undefined ? String(valueRaw) : '';
                tooltipItems.push({ displayName: valuesData.source.displayName, value: formattedValue });
            }

            tooltipData.forEach((measure, index) => {
                const measureValue = measure.values[i];
                if (measureValue !== undefined) {
                    const formattedMeasure = this.formatters.forTooltips[index].format(measureValue);
                    tooltipItems.push({ displayName: measure.source.displayName, value: formattedMeasure });
                }
            });

            if (captionsEnabled) {
                switch (captionType) {
                    case "value": captionText = formattedValue; break;
                    case "category_value": captionText = formattedValue ? `${formattedCategory}: ${formattedValue}` : formattedCategory; break;
                    case "category": default: captionText = formattedCategory; break;
                }
            }

            const frame: ImageFrame = {
                identity,
                imageUri: this.uriSanitizer(imageData.values[i] as string),
                caption: captionText,
                tooltips: tooltipItems,
                opacity: opacity
            };
            frames.push(frame);
        }
        return frames;
    }


    /**
         * Sanitizes a URI based on the static `BLOCK_EXTERNAL_URLS` policy.
         * If the policy is true, it strictly allows only data URIs.
         * If the policy is false, it validates and allows `http` or `httpsa` URLs.
         *
         * @param src The raw image source string.
         * @returns A sanitized URI string or null if the input is invalid or blocked by policy.
         */
    private uriSanitizer(src: string): string | null {
        if (!src || typeof src !== 'string') {
            return null;
        }

        const trimmedSrc = src.trim();
        if (trimmedSrc === '') {
            return null;
        }

        // Data URIs are self-contained and always processed first.
        if (trimmedSrc.toLowerCase().startsWith('data:')) {
            return this.sanitizeDataUri(trimmedSrc);
        }

        // Check the policy for handling external URLs.
        if (Visual.BLOCK_EXTERNAL_URLS) {
            // **Strict Mode**: Since it's not a data URI, it's blocked.
            console.warn('External URL blocked: Visual is in certified mode (BLOCK_EXTERNAL_URLS is true).');
            return null;
        } else {
            // **Flexible Mode**: Attempt to validate the URL.
            try {
                const url = new URL(trimmedSrc);

                // **Sanitization**: Explicitly allow only 'http:' and 'https:' protocols
                // to prevent security risks from protocols like 'javascript:' or 'file:'.
                //if (url.protocol === 'http:' || url.protocol === 'https:') {
                if (url.protocol === 'https:') {
                    return url.href; // Return the normalized, valid URL.
                }

                // Reject URLs with other protocols.
                return null;
            } catch (error) {
                // The URL constructor failed, meaning the URL is malformed.
                return null;
            }
        }
    }

    /**
     * Internal helper to sanitize the common data URI format based on explicit rules.
     * @param uri The full data URI string.
     * @returns A sanitized data URI string or null if malformed.
     */
    private sanitizeDataUri(uri: string): string | null {
        const commaIndex = uri.indexOf(',');
        if (commaIndex === -1) {
            return null; // Malformed: must have a comma separator.
        }

        const prefix = uri.substring(0, commaIndex);
        const content = uri.substring(commaIndex + 1);

        if (content === undefined) {
            return null; // Malformed: must have content.
        }

        const isBase64 = prefix.includes(';base64');
        // Isolate the core media type (e.g., "data:image/png" or "data:image/svg+xml")
        const mediaType = prefix.split(';')[0];

        if (isBase64) {
            // --- RULE FOR BASE64 ---
            // The final prefix must be exactly 'mediaType;base64'.
            // This rebuilds the prefix cleanly, ensuring no other encodings like ';utf8' remain.
            // It correctly handles formats like png, jpeg, gif, etc.
            const finalPrefix = `${mediaType};base64`;

            // The image content must be kept raw and must not be encoded.
            return `${finalPrefix},${content}`;

        } else {
            // --- RULE FOR SVG/TEXT ---
            // The final prefix must only be the media type (e.g., 'data:image/svg+xml').
            // This explicitly removes any specifiers like ';utf8' or ';charset=...'.
            const finalPrefix = mediaType;

            // The textual content (like SVG markup) must be URI-encoded for security.
            const encodedContent = encodeURIComponent(content);
            return `${finalPrefix},${encodedContent}`;
        }
    }

    private createAwaitingDataFrames(): ImageFrame[] {
        const placeholderSvg = Visual.createPlaceholderSvg(Visual.INVALID_MESSAGE);
        const placeholderFrame: ImageFrame = {
            identity: null,
            imageUri: placeholderSvg,
            caption: "Awaiting data",
            tooltips: undefined,
            opacity: 1.0
        };
        return [placeholderFrame];
    }

    /**
 * Move the caption container relative to the image container
 * @param position "above" | "below"
 */
    private moveLabelContainer(position: "top" | "bottom") {
        if (position === "top") {
            this.captionContainer.node()?.parentNode?.insertBefore(this.captionContainer.node()!, this.imageContainer.node());
        } else {
            this.imageContainer.node()?.parentNode?.insertBefore(this.captionContainer.node()!, this.imageContainer.node()?.nextSibling || null);
        }
    }

    /**
     * Move the progress indicator relative to the content container
     * @param position "above" | "below"
     */
    private moveProgressIndicator(position: "top" | "bottom") {
        if (position === "top") {
            this.rootElement.node()?.insertBefore(this.progressIndicator.node()!, this.contentContainer.node());
        } else {
            this.rootElement.node()?.insertBefore(this.progressIndicator.node()!, this.contentContainer.node()?.nextSibling || null);
        }
    }

    private updateStyling(settings: VisualFormattingSettingsModel) {
        const general = settings.generalCard;
        const navigation = settings.navigationCard;
        const caption = settings.captionCard;
        general.backgroundColor.value.value = general.backgroundColor.value.value || this.colorPalette.background.value;
        //navigation.activeDotColor.value.value = navigation.activeDotColor.value.value || this.colorPalette.hyperlink.value;

        this.rootElement
            //.style("background-color", general.backgroundColor.value.value)            
            .style("background-color", general.backgroundColor.value.value) // Use host background color for better theme integration
        //.classed("label-above", caption.position.value.value === 'above');

        this.settingColors(settings);

        const alignment = general.imageAlignment.value.value as string;
        this.imageContainer.style("--alignment", alignment);
        //this.imageContainer.selectAll("img").style("object-fit", alignment);
        this.progressIndicator.style("display", navigation.show.value ? "flex" : "none");
        //this.rootElement.style("--active-dot-color", navigation.activeDotColor.value.value);
        this.controlsWrapper.select(".panel-indicator").style("display", "flex");
        this.captionContainer
            .style("display", caption.show.value ? "block" : "none")
            .style("font-family", caption.font.fontFamily.value)
            .style("font-size", `${caption.font.fontSize.value}pt`)
            .style("font-weight", caption.font.bold.value ? "bold" : "normal")
            .style("font-style", caption.font.italic.value ? "italic" : "normal")
            .style("color", caption.color.value.value);
    }

    private settingColors(settings: VisualFormattingSettingsModel) {
        const navigation = settings.navigationCard;
        navigation.activeDotColor.value.value = this.isHighContrast
            ? this.colorPalette.foregroundSelected.value
            : navigation.activeDotColor.value.value || this.colorPalette.hyperlink.value;
        const dotColor = this.isHighContrast
            ? this.colorPalette.background.value
            : this.colorPalette.foregroundButton.value;
        const hoveredDotColor = this.isHighContrast
            ? this.colorPalette.background.value
            : this.colorPalette.foregroundSelected.value;
        this.rootElement.style("--dot-color", dotColor);
        this.rootElement.style("--dot-border-color", this.colorPalette.foreground.value);        
        this.rootElement.style("--hovered-dot-color", hoveredDotColor);
        this.rootElement.style("--hovered-dot-border-color", this.colorPalette.foregroundSelected.value);
        this.rootElement.style("--active-dot-color", navigation.activeDotColor.value.value);
    }

    private defaultStyling() {
        this.progressIndicator.style("display", "none");
        this.controlsWrapper.select(".panel-indicator").style("display", "none");
        this.controlsWrapper.classed("is-expanded", false);
        this.captionContainer
            .style("display", "block")
            .style("font-family", "Segoe UI")          // fontFamily default
            .style("font-size", `12pt`)                // fontSize default
            .style("font-weight", "normal")            // bold default is false
            .style("font-style", "normal")             // italic default is false
            .style("color", "#333333");                // caption color default
    }
}