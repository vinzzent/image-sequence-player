"use strict";

// #region IMPORTS

import { Selection as d3Selection } from "d3";
import { select as d3Select } from "d3-selection";
import { ColorHelper } from "powerbi-visuals-utils-colorutils";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { ImageFrame } from "./common-interfaces";
import { VisualFormattingSettingsModel } from "./settings";
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import DataView = powerbi.DataView;

// #endregion

// === BEGIN CHANGE: Formatter functions for Label and Index ===

/**
 * Formats the label text based on the selected type.
 */
export function formatLabel(type: string, category: string, value: string): string {
    switch (type) {
        case "value":
            return value;
        case "category_value":
            return value ? `${category}: ${value}` : category;
        case "value_category":
            return category ? `${value} (${category})` : value;
        case "nothing":
            return "";
        case "category":
        default:
            return category;
    }
}

/**
 * Formats the index text based on the selected type.
 */
export function formatIndex(type: string, currentIndex: number, totalFrames: number): string {
    const n = currentIndex + 1;
    switch (type) {
        case "n_dot":
            return `${n}.`;
        case "hash_n":
            return `#${n}`;
        case "parenthesis_n":
            return `(${n})`;
        case "n_of_N":
            return `${n}/${totalFrames}`;
        case "nothing":
            return "";
        case "n":
        default:
            return `${n}`;
    }
}
// === END CHANGE ===

// #region handleContextMenu

/**
 * Attaches a right-click context menu handler to the root element for image frames.
 * @param selectionManager The selection manager used to show the context menu.
 * @param rootElement The D3 selection of the root container element.
 */
export function handleContextMenu(selectionManager: ISelectionManager, rootElement: d3Selection<HTMLDivElement, any, any, any>) {
    rootElement.on("contextmenu", (event: MouseEvent) => {
        event.preventDefault();
        const targetElement = event.target as HTMLElement;
        const dataPoint = d3Select(targetElement).datum() as ImageFrame | undefined;
        const selectionId = dataPoint?.identity ? dataPoint.identity : {};
        selectionManager.showContextMenu(selectionId, {
            x: event.clientX,
            y: event.clientY
        });
    });
}

// #endregion

// #region buildErrorSvgString

/**
 * Builds an SVG error icon string using theme and high-contrast colors.
 * @param colorHelper Utility for resolving theme and high-contrast colors.
 * @returns SVG markup string for the error icon.
 */
export function buildErrorSvgString(colorHelper: ColorHelper): string {
    const fillColor = colorHelper.getHighContrastColor("background", colorHelper.getThemeColor("foreground"));
    const strokeColor = colorHelper.getHighContrastColor("foreground", colorHelper.getThemeColor("foreground"));
    const strokeWidth = colorHelper.isHighContrast ? 0.2 : 0;
    const opacity = 0.4;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 20.8 20.8">
        <g opacity="${opacity}">
            <path d="m20 20.8.8-.8L.8 0 0 .8Z" 
                fill="${fillColor}" 
                stroke="${strokeColor}" 
                stroke-width="${strokeWidth}"/>
            <circle cx="15.4" cy="6.9" r="1.5" 
                fill="${fillColor}" 
                stroke="${strokeColor}" 
                stroke-width="${strokeWidth}"/>
            <path d="M1.4 18.4v-.5l3-3a1.5 1.5 0 0 0 .6.2 1.4 1.4 0 0 0 1-.4l3-3-.8-.6L5.4 14a.5.5 0 0 1-.7 0 .5.5 0 0 0-.7 0l-2.6 2.4V4.2l-1-1v16.2h16.2l-1-1z" 
                fill="${fillColor}" 
                stroke="${strokeColor}" 
                stroke-width="${strokeWidth}"/>
            <path d="m6.2 3.4-1-1h15.2v15.2l-1-1v-.7l-3.1-3.1-.4.3-.7-.8.8-.6a.5.5 0 0 1 .7 0l2.7 2.8V3.4Z" 
                fill="${fillColor}" 
                stroke="${strokeColor}" 
                stroke-width="${strokeWidth}"/>
        </g>
    </svg>`;
}

// #endregion

// #region createAwaitingDataFrames

/**
 * Creates an image frame with a placeholder SVG showing an awaiting data message.
 * @param message Text to display inside the placeholder SVG.
 * @param colorHelper Utility for resolving theme and high-contrast colors.
 * @returns An array containing a single awaiting-data image frame.
 */
export function createAwaitingDataFrames(message: string, colorHelper: ColorHelper): ImageFrame[] {
    const textColor = colorHelper.getHighContrastColor("foreground", colorHelper.getThemeColor("foreground"));
    const placeholderSvg = _createPlaceholderSvg(message, textColor);
    const placeholderFrame: ImageFrame = {
        identity: null,
        imageUri: placeholderSvg,
        caption: "Awaiting data",
        indexText: "",
        tooltips: undefined,
        dimmed: false
    };
    return [placeholderFrame];
}

/**
 * Generates a data URI for an SVG placeholder with centered text lines.
 * @param message Text content, supporting multiple lines separated by "\n".
 * @param textColor Fill color applied to the text.
 * @returns A data URI string containing the encoded SVG.
 */
function _createPlaceholderSvg(message: string, textColor: string): string {
    const textStyle = `font-family:'Segoe UI',sans-serif; font-size:14px; fill:${textColor};`;
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

// === BEGIN CHANGE: Replace fallback index SVG with transparent fallback ===
/**
 * Generates a data URI for a completely transparent 1x1 SVG fallback image.
 * @returns A data URI string containing the encoded SVG.
 */
function _createTransparentFallbackSvg(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="transparent"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
// === END CHANGE ===

// #endregion

// #Reregion isDataViewValid

/**
 * Validates if the given DataView contains required categorical and image data.
 * @param dataView The DataView object to check.
 * @returns True if the DataView is valid, otherwise false.
 */
export function isDataViewValid(dataView: DataView): boolean {
    const categorical = dataView && dataView.categorical;
    
    // === BEGIN CHANGE: Category-only fallback mode ===
    // Removed requirement for categorical.values as it could be undefined if only Category is used
    if (!categorical || !categorical.categories) {
        return false;
    }

    const sequenceData = categorical.categories.find(c => c.source?.roles?.["category"]);

    if (!sequenceData || !sequenceData.values || sequenceData.values.length === 0) {
        return false;
    }
    // === END CHANGE ===
    return true;
}

// #endregion

// #Reregion transformDataViewToFrames

/**
 * Transforms a DataView into an array of image frames with captions and tooltips.
 * @param dataView The DataView containing categories, values, images, and tooltips.
 * @param visualSettings Visual formatting settings controlling captions and display.
 * @param host The Power BI visual host used to create selection identities.
 * @param blockExtenalUrls Whether to block external image URLs for security.
 * @param onlyHttps If true, only HTTPS URLs are allowed. If false, HTTP and HTTPS are allowed.
 * @param colorHelper Utility for dynamically generating colors for fallback SVGs.
 * @returns An array of ImageFrame objects built from the DataView.
 */
// === BEGIN CHANGE: Category-only fallback mode ===
export function transformDataViewToFrames(dataView: DataView, visualSettings: VisualFormattingSettingsModel, host: IVisualHost, blockExtenalUrls: boolean, onlyHttps: boolean, colorHelper: ColorHelper): ImageFrame[] {
// === END CHANGE ===
    const categorical = dataView.categorical;
    const categories = categorical?.categories?.find(c => c.source.roles?.["category"]);
    const categoryFormat = categories?.source?.format;
    const valuesData = categorical?.values?.find(v => v.source.roles?.["value"]);
    const valueFormat = valuesData?.source?.format;
    const tooltipData = categorical?.values?.filter(v => v.source.roles?.["tooltips"]);
    const tooltipFormats = tooltipData?.map(v => v.source?.format) || [];
    const imageData = categorical?.values?.find(v => v.source.roles?.["imageUri"]);
    const formatters = {
        forCategory: categories ? valueFormatter.create({ format: categoryFormat }) : undefined,
        forValue: valuesData ? valueFormatter.create({ format: valueFormat }) : undefined,
        forTooltips: tooltipFormats.map(f => valueFormatter.create({ format: f }))
    };
    
    // === BEGIN CHANGE: Category-only fallback mode ===
    // Removed dependency on `imageData` so it proceeds if at least `categories` are valid
    if (!categories?.values) {
        return [];
    }
    // === END CHANGE ===
    
    const imageHighlights = imageData?.highlights;
    const isAnyHighlightActive = imageHighlights !== undefined;
    const frames: ImageFrame[] = [];
    const captionsEnabled = visualSettings.captionCard.show.value;
    const captionType = visualSettings.captionCard.type.value.value as string;
// === BEGIN CHANGE: Retrieve indexType ===
    const indexType = visualSettings.captionCard.indexType.value.value as string;
// === END CHANGE ===
    for (let i = 0; i < categories.values.length; i++) {
        const identity = host.createSelectionIdBuilder()
            .withCategory(categories, i)
            .createSelectionId();
        let dimmed = false; // default: not dimmed (fully visible)
        if (isAnyHighlightActive) {
            const highlightVal = imageHighlights ? imageHighlights[i] : null;
            if (highlightVal === null || highlightVal === "") {
                dimmed = true; // dimmed when not highlighted
            }
        }
        let captionText = '';
        const tooltipItems: VisualTooltipDataItem[] = [];
        const categoryRaw = categories.values[i];
        const formattedCategory = formatters.forCategory
            ? formatters.forCategory.format(categoryRaw)
            : String(categoryRaw);
        tooltipItems.push({ displayName: categories.source.displayName, value: formattedCategory });
        let formattedValue = '';
        if (valuesData) {
            const valueRaw = valuesData.values[i];
            formattedValue = formatters.forValue && valueRaw !== undefined
                ? formatters.forValue.format(valueRaw)
                : valueRaw !== undefined ? String(valueRaw) : '';
            tooltipItems.push({ displayName: valuesData.source.displayName, value: formattedValue });
        }

        tooltipData?.forEach((measure, index) => {
            const measureValue = measure.values[i];
            if (measureValue !== undefined) {
                const formattedMeasure = formatters.forTooltips[index].format(measureValue);
                tooltipItems.push({ displayName: measure.source.displayName, value: formattedMeasure });
            }
        });
        
// === BEGIN CHANGE: Use formatLabel ===
        if (captionsEnabled) {
            captionText = formatLabel(captionType, formattedCategory, formattedValue);
        }
// === END CHANGE ===
        
        // === BEGIN CHANGE: Set indexText and use transparent fallback SVG ===
        const indexText = formatIndex(indexType, i, categories.values.length);
        const imageUri: string | null = imageData 
            ? _uriSanitizer(imageData.values[i] as string, blockExtenalUrls, onlyHttps)
            : _createTransparentFallbackSvg();        
        
        const frame: ImageFrame = {
            identity,
            imageUri: imageUri,
            caption: captionText,
            indexText: indexText,
            tooltips: tooltipItems,
            dimmed: dimmed
        };
        // === END CHANGE ===
        frames.push(frame);
    }
    return frames;
}

/**
 * Sanitizes a string as a data URI or external URL based on security policy.
 * @param src The source string to sanitize.
 * @param blockExtenalUrls If true, external URLs are blocked and only data URIs are allowed.
 * @param onlyHttps If true, only HTTPS URLs are allowed. If false, HTTP and HTTPS are allowed.
 * @returns A sanitized URI string or null if invalid or blocked.
 */
function _uriSanitizer(src: string, blockExtenalUrls: boolean, onlyHttps: boolean): string | null {
    if (!src || typeof src !== 'string') {
        return null;
    }
    const trimmedSrc = src.trim();
    if (trimmedSrc === '') {
        return null;
    }
    // Data URIs are self-contained and always processed first.
    if (trimmedSrc.toLowerCase().startsWith('data:')) {
        return _sanitizeDataUri(trimmedSrc);
    }
    // Check the policy for handling external URLs.
    if (blockExtenalUrls) {
        // **Strict Mode**: Since it's not a data URI, it's blocked.
        console.warn('External URL blocked');
        return null;
    }
    // External URL allowed → validate protocol
    try {
        const url = new URL(trimmedSrc);
        if (onlyHttps) {
            if (url.protocol === 'https:') {
                return url.href;
            }
            console.warn('Blocked non-HTTPS URL:', trimmedSrc);
            return null;
        }
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return url.href;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Internal helper to sanitize the common data URI format based on explicit rules.
 * @param uri The full data URI string.
 * @returns A sanitized data URI string or null if malformed.
 */
function _sanitizeDataUri(uri: string): string | null {
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

// #endregion

// #region moveLabelContainer

/**
 * Moves a caption container above or below the image container in the DOM.
 * @param position "top" to place above, "bottom" to place below the image container.
 * @param captionContainer The D3 selection of the caption container to move.
 * @param imageContainer The D3 selection of the reference image container.
 */
export function moveLabelContainer(position: "top" | "bottom",
    captionContainer: d3Selection<HTMLDivElement, any, any, any>,
    imageContainer: d3Selection<HTMLDivElement, any, any, any>) {
    if (position === "top") {
        captionContainer.node()?.parentNode?.insertBefore(captionContainer.node()!, imageContainer.node());
    } else {
        imageContainer.node()?.parentNode?.insertBefore(captionContainer.node()!, imageContainer.node()?.nextSibling || null);
    }
}

// #endregion

// #region moveProgressIndicator

/**
 * Moves a progress indicator above or below the content container in the DOM.
 * @param position "top" to place above, "bottom" to place below the content container.
 * @param rootElement The D3 selection of the root container element.
 * @param progressIndicator The D3 selection of the progress indicator to move.
 * @param contentContainer The D3 selection of the content container used as reference.
 */
export function moveProgressIndicator(position: "top" | "bottom",
    rootElement: d3Selection<HTMLDivElement, any, any, any>,
    progressIndicator: d3Selection<HTMLDivElement, any, any, any>,
    contentContainer: d3Selection<HTMLDivElement, any, any, any>
) {
    if (position === "top") {
        rootElement.node()?.insertBefore(progressIndicator.node()!, contentContainer.node());
    } else {
        rootElement.node()?.insertBefore(progressIndicator.node()!, contentContainer.node()?.nextSibling || null);
    }
}

// #endregion

// #region moveIndex

/**
 * Moves the index span to the left or right of the label inside the caption container.
 * @param position "left" to place before, "right" to place after the label.
 * @param captionContainer The D3 selection of the caption container.
 * @param captionIndex The D3 selection of the index span to move.
 * @param captionLabel The D3 selection of the label span used as reference.
 */
export function moveIndex(
    position: "left" | "right",
    captionContainer: d3Selection<HTMLDivElement, any, any, any>,
    captionIndex: d3Selection<HTMLSpanElement, any, any, any>,
    captionLabel: d3Selection<HTMLSpanElement, any, any, any>
) {
    if (position === "left") {
        captionContainer.node()?.insertBefore(captionIndex.node()!, captionLabel.node());
    } else {
        captionContainer.node()?.insertBefore(captionIndex.node()!, captionLabel.node()?.nextSibling || null);
    }
}

// #endregion

// #region updateStyling

/**
 * Applies visual formatting settings and theme colors to the visual's DOM elements.
 * @param settings The visual's formatting settings model.
 * @param colorHelper Utility for resolving theme and high-contrast colors.
 * @param rootElement D3 selection of the root container element.
 * @param imageContainer D3 selection of the image container element.
 * @param progressIndicator D3 selection of the progress indicator element.
 * @param captionContainer D3 selection of the caption container element.
 * @param controlsWrapper D3 selection of the controls wrapper element.
 */
export function updateStyling(settings: VisualFormattingSettingsModel,
    colorHelper: ColorHelper,
    rootElement: d3Selection<HTMLDivElement, any, any, any>,
    imageContainer: d3Selection<HTMLDivElement, any, any, any>,
    progressIndicator: d3Selection<HTMLDivElement, any, any, any>,
    captionContainer: d3Selection<HTMLDivElement, any, any, any>,
    controlsWrapper: d3Selection<HTMLDivElement, any, any, any>) {
    const general = settings.generalCard;
    const navigation = settings.navigationCard;
    const caption = settings.captionCard;
    general.backgroundColor.value.value = colorHelper.getHighContrastColor("background", general.backgroundColor.value.value || colorHelper.getThemeColor("background"));

    rootElement.style("--visual-background-color", general.backgroundColor.value.value) // Use host background color for better theme integration        

    _settingColors(settings, colorHelper, progressIndicator, controlsWrapper);

    imageContainer.style("--alignment", general.imageAlignment.value.value as string);
    progressIndicator.classed("hidden", !navigation.show.value);

    captionContainer
        .classed("hidden", !caption.show.value)
        .classed("is-bold", caption.font.bold?.value || false)
        .classed("is-italic", caption.font.italic?.value || false)
        .classed("is-underlined", caption.font.underline?.value || false)
        .style("--caption-font-family", caption.font.fontFamily.value)
        .style("--caption-font-size", `${caption.font.fontSize.value}pt`)
        .style("--caption-color", caption.color.value.value);
}

/**
 * Applies high-contrast and theme colors to navigation dots and control panel elements.
 * @param settings The visual's formatting settings model.
 * @param colorHelper Utility for resolving theme and high-contrast colors.
 * @param progressIndicator D3 selection of the progress indicator element.
 * @param controlsWrapper D3 selection of the controls wrapper element.
 */
function _settingColors(settings: VisualFormattingSettingsModel,
    colorHelper: ColorHelper,
    progressIndicator: d3Selection<HTMLDivElement, any, any, any>,
    controlsWrapper: d3Selection<HTMLDivElement, any, any, any>) {
    const generalDotSettings = settings.navigationCard.generalDotSettings;
    const dotNumbers = settings.navigationCard.dotNumbers;

    generalDotSettings.activeDotColor.value.value = colorHelper.getHighContrastColor("foregroundSelected", generalDotSettings.activeDotColor.value.value || colorHelper.getThemeColor("hyperlink"));
    dotNumbers.dotNumbersColor.value.value = colorHelper.getHighContrastColor("foreground", dotNumbers.dotNumbersColor.value.value || colorHelper.getThemeColor("background"));
    colorHelper.getThemeColor("foreground");

    progressIndicator
        .style("--dot-color", colorHelper.getHighContrastColor("background", colorHelper.getThemeColor("foregroundButton")))
        .style("--dot-text-color", dotNumbers.dotNumbersColor.value.value)
        .style("--dot-border-color", colorHelper.getHighContrastColor("foreground", colorHelper.getThemeColor("foreground")))
        .style("--hovered-dot-color", colorHelper.getHighContrastColor("background", colorHelper.getThemeColor("foregroundSelected")))
        .style("--hovered-dot-border-color", colorHelper.getHighContrastColor("foregroundSelected", colorHelper.getThemeColor("foregroundSelected")))
        .style("--active-dot-color", generalDotSettings.activeDotColor.value.value)
        .style("--scrollbar-color", colorHelper.getHighContrastColor("background", colorHelper.getThemeColor("foregroundButton")))
        .style("--scrollbar-border-color", colorHelper.getHighContrastColor("foreground", colorHelper.getThemeColor("foreground")));

    controlsWrapper
        .style("--panel-indicator-color", colorHelper.getHighContrastColor("background", colorHelper.getThemeColor("background")))
        .style("--panel-indicator-border-color", colorHelper.getHighContrastColor("foreground", colorHelper.getThemeColor("foregroundButton")))
        .style("--hovered-panel-indicator-border-color", colorHelper.getHighContrastColor("foregroundSelected", colorHelper.getThemeColor("foreground")));
}

// #endregion