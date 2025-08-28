"use strict";

import powerbi from "powerbi-visuals-api";
import { select as d3Select, Selection } from "d3-selection";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel } from "./settings";

import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import DataView = powerbi.DataView;

import "./../style/visual.less";

// --- Interfaces ---
interface ImageFrame {
    identity: ISelectionId;
    imageUri: string;
    label: string;
}

//interface ImageSequenceViewModel {
    //frames: ImageFrame[];
    //settings: VisualFormattingSettingsModel;
//}

interface IconData {
    viewBox: string;
    path: string;
}

export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private selectionManager: ISelectionManager;
    private target: HTMLElement;
    //private viewModel: ImageSequenceViewModel;
    private imageFrames: ImageFrame[] = [];
    private formattingSettingsService: FormattingSettingsService;
    private visualSettings: VisualFormattingSettingsModel;
    private rootElement: d3.Selection<HTMLDivElement, any, any, any>;
    private contentContainer: d3.Selection<HTMLDivElement, any, any, any>;
    private imageContainer: d3.Selection<HTMLDivElement, any, any, any>;
    private currentImageElement: d3.Selection<HTMLImageElement, any, any, any>;
    private nextImageElement: d3.Selection<HTMLImageElement, any, any, any>;
    private labelContainer: d3.Selection<HTMLDivElement, any, any, any>;
    private controlsWrapper: d3.Selection<HTMLDivElement, any, any, any>;
    private progressIndicator: d3.Selection<HTMLDivElement, any, any, any>;
    private playPauseButton: d3.Selection<HTMLButtonElement, any, any, any>;
    private currentIndex: number = 0;
    private isPlaying: boolean = false;
    private isLooping: boolean = false;
    private playbackTimer: number;
    private isTransitioning: boolean = false;
    private isDataValid: boolean = false;

    // --- Lightweight image cache for smooth next-frame transitions ---
    private imageCache: Map<string, HTMLImageElement> = new Map();
    private readonly maxCacheEntries: number = 8;

    private static ICONS: { [key: string]: IconData } = {
        play: { viewBox: "0 0 24 24", path: "M8 5v14l11-7z" },
        pause: { viewBox: "0 0 24 24", path: "M6 19h4V5H6v14zm8-14v14h4V5h-4z" },
        goToStart: { viewBox: "0 0 24 24", path: "M6 6h2v12H6zm3.5 6l8.5 6V6z" },
        stepBack: { viewBox: "0 0 24 24", path: "M11 18V6l-8.5 6 8.5 6zm-2-6l6 4.5V7.5l-6 4.5z" },
        stepForward: { viewBox: "0 0 24 24", path: "M13 6v12l8.5-6-8.5-6zm2 6l-6-4.5v9l6-4.5z" },
        goToEnd: { viewBox: "0 0 24 24", path: "M16 6h2v12h-2zm-3.5 6l-8.5 6V6z" },
        loop: { viewBox: "0 0 24 24", path: "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" },
        upArrow: { viewBox: "0 0 24 24", path: "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" }
    };

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.selectionManager = this.host.createSelectionManager();
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();

        this.rootElement = d3Select(this.target).append("div").classed("image-sequence-player", true);
        this.contentContainer = this.rootElement.append("div").classed("content-container", true);
        this.labelContainer = this.contentContainer.append("div").classed("label-container", true);
        this.imageContainer = this.contentContainer.append("div").classed("image-container", true);

        this.currentImageElement = this.imageContainer.append("img").attr("alt", "Image Frame 1").classed("active", true);
        this.nextImageElement = this.imageContainer.append("img").attr("alt", "Image Frame 2").classed("standby", true);
        this.progressIndicator = this.rootElement.append("div").classed("progress-indicator", true);

        this.setupControls();
    }

    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options);
        const dataView = options.dataViews && options.dataViews[0];
        this.visualSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);

        this.isDataValid = this.isDataViewValid(dataView);

        // Get the view model (either real or placeholder)
        if (this.isDataValid) {
            this.imageFrames = this.visualTransform(dataView);
        } else {
            this.imageFrames = this.createPlaceholderViewModel();
        }

        //const { frames, settings } = this.viewModel;
        this.currentIndex = Math.max(0, Math.min(this.currentIndex, this.imageFrames.length - 1));

        // --- Centralized UI State Logic ---
        if (this.isDataValid) {
            // If data is valid, apply all user styling and preload the next image.
            this.updateStyling(this.visualSettings);
            this.preloadNextImage(this.currentIndex);
            this.controlsWrapper.select(".panel-indicator").style("display", "flex");
        } else {
            // If data is invalid, explicitly hide all optional controls, overriding any settings.
            this.defaultStyling()
        }

        // Render always runs, showing either the placeholder or the first valid frame.
        this.render(this.currentIndex, -1);

        this.events.renderingFinished(options);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.visualSettings);
    }

    /**
     * Return a decoded HTMLImageElement for a given src, using a small LRU cache.
     * Ensures the image is decoded before we transition, minimizing flicker.
     */
    private async loadAndDecode(src: string): Promise<HTMLImageElement> {
        if (!src) return null as any;

        // If we already cached it, refresh LRU order and ensure decode
        const cached = this.imageCache.get(src);
        if (cached) {
            // Refresh LRU order
            this.imageCache.delete(src);
            this.imageCache.set(src, cached);

            if (typeof (cached as any).decode === "function") {
                try { await cached.decode(); } catch { /* ignore */ }
            } else if (!cached.complete) {
                await new Promise<void>(resolve => {
                    cached.onload = () => resolve();
                    cached.onerror = () => resolve();
                });
            }
            return cached;
        }

        // Not cached: create, set src, and wait
        const img = new Image();
        const wait = new Promise<void>(resolve => {
            img.onload = () => resolve();
            img.onerror = () => resolve(); // fail-safe: still resolve
        });
        img.src = src;

        // Wait for load/decode
        await wait;
        if (typeof (img as any).decode === "function") {
            try { await img.decode(); } catch { /* ignore */ }
        }

        // Insert into cache and evict if needed
        this.imageCache.set(src, img);
        this.evictOldestIfNeeded();

        return img;
    }

    /** Keep cache small to avoid memory pressure. */
    private evictOldestIfNeeded() {
        while (this.imageCache.size > this.maxCacheEntries) {
            const oldestKey = this.imageCache.keys().next().value;
            this.imageCache.delete(oldestKey);
        }
    }

    /** Preload only the next frame (lazy strategy). */
    private async preloadNextImage(fromIndex: number) {
        const frames = this.imageFrames;
        if (!frames || frames.length < 2) return;

        const nextIndex = (fromIndex + 1) % frames.length;
        const nextSrc = frames[nextIndex]?.imageUri;
        if (!nextSrc) return;

        try {
            await this.loadAndDecode(nextSrc);
        } catch { /* ignore errors */ }
    }

    private static createPlaceholderSvg(message: string): string {
        const textStyle = `font-family: 'Segoe UI', sans-serif; font-size: 14px; fill: #666666;`;
        const textLines = message.split("'").map((line, index) =>
            `<tspan x="50%" dy="${index === 0 ? '-0.5em' : '1.2em'}">'${line}'</tspan>`
        ).join("");

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
                        <text x="50%" y="50%" text-anchor="middle" style="${textStyle}">
                            ${textLines}
                        </text>
                     </svg>`;

        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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

    private visualTransform(dataView: DataView): ImageFrame[] {
        const categorical = dataView.categorical;
        const sequenceData = categorical.categories[0];
        const imageData = categorical.values.find(v => v.source.roles["imageUri"]);
        const labelData = categorical.values.find(v => v.source.roles["label"]);

        //if (!sequenceData || !sequenceData.values || sequenceData.values.length === 0 || !imageData) {
            //return this.createPlaceholderViewModel(settings);
        //}

        const frames: ImageFrame[] = [];
        for (let i = 0; i < sequenceData.values.length; i++) {
            const identity = this.host.createSelectionIdBuilder()
                .withCategory(sequenceData, i)
                .createSelectionId();

            const frame: ImageFrame = {
                identity,
                imageUri: this.uriSanitizer(imageData.values[i] as string),
                label: labelData ? labelData.values[i] as string : ''
            };
            frames.push(frame);
        }

        return frames;
    }

    /**
 * Sanitizes data URIs ONLY and explicitly rejects external URLs.
 * This is the strict version for Power BI certification.
 * - It actively blocks any string that looks like a web URL. * 
 * @param src The raw image source string (expected to be a data URI).
 * @returns A sanitized data URI string or null if the input is invalid or a blocked URL.
 */
    private uriSanitizer(src: string): string | null {
        if (!src || typeof src !== 'string') {
            return null;
        }

        const trimmedSrc = src.trim();
        if (trimmedSrc === '') {
            return null;
        }

        // Block external URLs: Use a regex to detect common web protocols.
        // This is the core logic for meeting Power BI certification requirements.
        if (/^(https?|ftp):\/\//i.test(trimmedSrc)) {
            // Explicitly reject external URLs.
            return null;
        }

        // Handle data URIs using the same robust, shared logic.
        if (trimmedSrc.startsWith('data:')) {
            return this.sanitizeDataUri(trimmedSrc);
        }

        // If it's not a data URI (and we've already blocked URLs), it's invalid.
        return null;
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

    private createPlaceholderViewModel(): ImageFrame[] {
        const placeholderSvg = Visual.createPlaceholderSvg("Please add data to 'Sequence' and 'Image URL or SVG Text' fields.");
        const placeholderFrame: ImageFrame = {
            identity: null,
            imageUri: placeholderSvg,
            label: "Awaiting data"
        };
        return [placeholderFrame];
    }

    private createIconButton(container: Selection<any, any, any, any>, iconData: IconData): Selection<HTMLButtonElement, any, any, any> {
        const button = container.append("button");
        const svg = button.append("svg").attr("viewBox", iconData.viewBox);
        svg.append("path").attr("d", iconData.path);
        return button;
    }

    private updateButtonIcon(button: Selection<HTMLButtonElement, any, any, any>, iconData: IconData) {
        button.selectAll("*").remove();
        const svg = button.append("svg").attr("viewBox", iconData.viewBox);
        svg.append("path").attr("d", iconData.path);
    }

    private setupControls() {
        this.controlsWrapper = this.rootElement.append("div").classed("controls-wrapper", true);

        this.createIconButton(this.controlsWrapper, Visual.ICONS.upArrow)
            .classed("panel-indicator", true)
            .on("click", () => {
                const isExpanded = this.controlsWrapper.classed("is-expanded");
                this.controlsWrapper.classed("is-expanded", !isExpanded);
            });

        const panel = this.controlsWrapper.append("div").classed("controls-panel", true);
        const buttons = panel.append("div").classed("control-buttons", true);

        this.createIconButton(buttons, Visual.ICONS.goToStart).on("click", () => this.goToFrame(0));
        this.createIconButton(buttons, Visual.ICONS.stepBack).on("click", () => this.step(-1));
        this.playPauseButton = this.createIconButton(buttons, Visual.ICONS.play).on("click", () => this.togglePlayback());
        this.createIconButton(buttons, Visual.ICONS.stepForward).on("click", () => this.step(1));
        this.createIconButton(buttons, Visual.ICONS.goToEnd).on("click", () => this.goToFrame(this.imageFrames.length - 1));
        this.createIconButton(buttons, Visual.ICONS.loop)
            .classed("loop-toggle", true)
            .on("click", (event) => {
                this.isLooping = !this.isLooping;
                d3Select(event.currentTarget).classed("active", this.isLooping);
            });
    }

    private render(newIndex: number, oldIndex: number, isSteppingForward: boolean = true) {
        if (!this.imageFrames || !this.imageFrames[newIndex] || this.isTransitioning) {
            return;
        }

        const frames = this.imageFrames;
        const newFrame = frames[newIndex];

        const transitionType = this.visualSettings.transitionCard.transitionType.value.value as string;
        const transitionDuration = this.visualSettings.transitionCard.transitionDuration.value;

        // On the very first render, just set the image source without transition
        if (oldIndex === -1) {
            this.currentImageElement.attr("src", newFrame.imageUri);
        } else if (newIndex !== oldIndex) {
            // Make sure the next image is decoded before we animate
            this.loadAndDecode(newFrame.imageUri).then(() => {
                this.applyTransition(newFrame.imageUri, transitionType, transitionDuration, isSteppingForward);
            });
        }

        const newLabel = this.visualSettings.labelCard.show.value ? newFrame.label : "";
        this.labelContainer.text(newLabel);

        const dots = this.progressIndicator.selectAll(".dot").data(frames);
        dots.enter().append("div").classed("dot", true)
            .on("click", (event, d) => {
                if (this.isTransitioning) return;  // prevent multiple clicks
                this.selectFrameById(d.identity);
            });
        dots.classed("active", (d, i) => i === newIndex);
        dots.exit().remove();

        this.imageContainer.on("click", () => this.selectFrameById(newFrame.identity));

        // After rendering this frame, warm up the next one
        this.preloadNextImage(newIndex);
    }

    private applyTransition(newImageUri: string, type: string, duration: number, forward: boolean) {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        const nextNode = this.nextImageElement.node();
        if (!nextNode) {
            this.isTransitioning = false;
            return;
        }

        // 1. Determine animation names based on type and direction
        let currentAnimation: string, nextAnimation: string;
        const direction = forward ? 'fwd' : 'rev';

        switch (type) {
            case 'slideHorizontal':
                currentAnimation = direction === 'fwd' ? 'slideOutToRight' : 'slideOutToLeft';
                nextAnimation = direction === 'fwd' ? 'slideInFromLeft' : 'slideInFromRight';
                break;
            case 'slideVertical':
                currentAnimation = direction === 'fwd' ? 'slideOutToBottom' : 'slideOutToTop';
                nextAnimation = direction === 'fwd' ? 'slideInFromTop' : 'slideInFromBottom';
                break;
            case 'fade':
            default:
                currentAnimation = 'fadeOut';
                nextAnimation = 'fadeIn';
                break;
        }

        // 2. Define the cleanup logic to run after animation completes
        const cleanup = () => {
            // Remove event listener to prevent leaks
            nextNode.removeEventListener('animationend', cleanup);
            clearTimeout(safetyTimeout);

            // Reset styles and classes to their resting state
            this.currentImageElement.style("animation", null).attr("src", newImageUri).attr("class", "active");
            this.nextImageElement.style("animation", null).attr("class", "standby");

            this.isTransitioning = false;
        };

        // 3. Set up the elements for the transition
        this.currentImageElement.attr("class", "current");
        this.nextImageElement.attr("class", "next").attr("src", newImageUri);

        // 4. Attach a one-time event listener for cleanup
        nextNode.addEventListener('animationend', cleanup, { once: true });

        // 5. Apply the animations dynamically
        const durationMs = `${duration}ms`;
        const fillMode = 'forwards'; // Ensures the element holds its final animated state

        this.currentImageElement.style("animation", `${currentAnimation} ${durationMs} ${fillMode}`);
        this.nextImageElement.style("animation", `${nextAnimation} ${durationMs} ${fillMode}`);

        // 6. Safety timeout to guarantee cleanup in case animationend doesn't fire
        const safetyTimeout = setTimeout(cleanup, duration + 50);
    }

    private updateStyling(settings: VisualFormattingSettingsModel) {
        const general = settings.generalCard;
        const labels = settings.labelCard;

        this.rootElement
            .style("background-color", general.backgroundColor.value.value)
            .classed("label-above", labels.position.value.value === 'above');

        const alignment = general.imageAlignment.value.value as string;
        this.imageContainer.selectAll("img").style("object-fit", alignment);
        this.progressIndicator.style("display", general.showProgressIndicator.value ? "flex" : "none");

        this.labelContainer
            .style("display", labels.show.value ? "block" : "none")
            .style("font-family", labels.font.fontFamily.value)
            .style("font-size", `${labels.font.fontSize.value}pt`)
            .style("font-weight", labels.font.bold.value ? "bold" : "normal")
            .style("font-style", labels.font.italic.value ? "italic" : "normal")
            .style("color", labels.labelColor.value.value);
    }

private defaultStyling() {
    this.progressIndicator.style("display", "none");    
    this.controlsWrapper.select(".panel-indicator").style("display", "none");
    this.controlsWrapper.classed("is-expanded", false);
    this.labelContainer
        .style("display", "block" )
        .style("font-family", "Segoe UI")          // fontFamily default
        .style("font-size", `12pt`)                // fontSize default
        .style("font-weight", "normal")            // bold default is false
        .style("font-style", "normal")             // italic default is false
        .style("color", "#333333");                // labelColor default
}

    private playbackLoop() {

        if (!this.isPlaying) return;

        const frames = this.imageFrames;
        if (frames.length <= 1 && frames[0].identity === null) {
            this.pausePlayback();
            return;
        }

        this.playbackTimer = window.setTimeout(() => {
            let nextIndex = this.currentIndex + 1;

            if (nextIndex >= frames.length) {
                if (this.isLooping) {
                    nextIndex = 0;
                } else {
                    this.pausePlayback();
                    return;
                }
            }

            // Warm up the target before we switch
            this.preloadNextImage(this.currentIndex);

            if (this.visualSettings.playbackCard.selectionSequence.value) {
                this.selectionManager.clear();
                this.selectionManager.select(frames[nextIndex].identity);
            }

            this.goToFrame(nextIndex, true);
            this.playbackLoop();
        }, this.visualSettings.playbackCard.defaultFrameDuration.value);
    }

    private selectFrameById(identity: ISelectionId) {
        if (!identity) return;
        this.selectionManager.select(identity);
        const index = this.imageFrames.findIndex(f => f.identity && f.identity.equals(identity));
        if (index !== -1) {
            this.goToFrame(index, false);
        }
    }

    private goToFrame(index: number, startPlayback: boolean = true) {
        if (this.isTransitioning) return;

        if (this.isPlaying && !startPlayback) {
            this.pausePlayback();
        }

        const oldIndex = this.currentIndex;
        const isForward = index > oldIndex || (index === 0 && oldIndex === this.imageFrames.length - 1);
        this.currentIndex = index;
        this.render(this.currentIndex, oldIndex, isForward);
    }

    private step(direction: number) {
        if (this.isTransitioning) return;

        if (this.isPlaying) {
            this.pausePlayback();
        }

        const frames = this.imageFrames;
        if (frames.length <= 1 && frames[0].identity === null) return;

        let newIndex = this.currentIndex + direction;
        const frameCount = frames.length;

        if (newIndex >= frameCount) {
            newIndex = this.isLooping ? 0 : frameCount - 1;
        } else if (newIndex < 0) {
            newIndex = this.isLooping ? frameCount - 1 : 0;
        }

        this.goToFrame(newIndex, false);
    }

    private togglePlayback() {
        this.isPlaying ? this.pausePlayback() : this.startPlayback();
    }

    private startPlayback() {
        clearTimeout(this.playbackTimer);

        this.isPlaying = true;
        this.updateButtonIcon(this.playPauseButton, Visual.ICONS.pause);
        this.playbackLoop();
    }

    private pausePlayback() {
        this.isPlaying = false;
        this.updateButtonIcon(this.playPauseButton, Visual.ICONS.play);
        clearTimeout(this.playbackTimer);
    }
}