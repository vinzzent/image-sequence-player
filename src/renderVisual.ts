import { VisualFormattingSettingsModel } from "./settings";
import { select as d3Select, Selection } from "d3-selection";
import { ITooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

// --- Interfaces ---
interface ImageFrame {
    identity: ISelectionId;
    imageUri: string;
    caption: string;
    tooltips: VisualTooltipDataItem[];
    opacity: number;
}

interface IconData {
    viewBox: string;
    path: string;
}

interface RenderedOptions {
    selectionManager: ISelectionManager;
    controlsWrapper: d3.Selection<HTMLDivElement, any, any, any>;
    progressIndicator: d3.Selection<HTMLDivElement, any, any, any>;
    imageContainer: d3.Selection<HTMLDivElement, any, any, any>;
    captionContainer: d3.Selection<HTMLDivElement, any, any, any>;
    currentImageElement: d3.Selection<HTMLImageElement, any, any, any>;
    nextImageElement: d3.Selection<HTMLImageElement, any, any, any>;
    tooltipServiceWrapper: ITooltipServiceWrapper;
}

export class Renderer {
    private selectionManager: ISelectionManager;
    private imageFrames: ImageFrame[];
    private visualSettings: VisualFormattingSettingsModel;
    private tooltipServiceWrapper: ITooltipServiceWrapper;
    private imageContainer: d3.Selection<HTMLDivElement, any, any, any>;
    private currentImageElement: d3.Selection<HTMLImageElement, any, any, any>;
    private nextImageElement: d3.Selection<HTMLImageElement, any, any, any>;
    private captionContainer: d3.Selection<HTMLDivElement, any, any, any>;
    private controlsWrapper: d3.Selection<HTMLDivElement, any, any, any>;
    private progressIndicator: d3.Selection<HTMLDivElement, any, any, any>;
    private playPauseButton: d3.Selection<HTMLButtonElement, any, any, any>;
    private spinnerElement: d3.Selection<HTMLDivElement, any, any, any>;
    private currentIndex: number = 0;
    private oldIndex: number = -1;
    private isPlaying: boolean = false;
    private isLooping: boolean = false;
    private playbackTimer: number;
    private isTransitioning: boolean = false;
    private isFallbackImage: boolean = false;
    private isInitialLoading: boolean = false; // Tracks if spinner is active    
    // --- Lightweight image cache for smooth next-frame transitions ---
    private imageCache: Map<string, HTMLImageElement> = new Map();
    private readonly maxCacheEntries: number = 10;

    private static readonly FALLBACK_SVG: string = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 20.8 20.8">
                                                    <g opacity="0.5">
                                                        <path d="m20 20.8.8-.8L.8 0 0 .8Z" style="fill:#d40000"/>
                                                        <path d="M15.4 6.9a1.5 1.5 0 1 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5ZM1.4 18.4v-.5l3-3a1.5 1.5 0 0 0 .6.2 1.4 1.4 0 0 0 1-.4l3-3-.8-.6L5.4 14a.5.5 0 0 1-.7 0 .5.5 0 0 0-.7 0l-2.6 2.4V4.2l-1-1v16.2h16.2l-1-1z"/>
                                                        <path d="m6.2 3.4-1-1h15.2v15.2l-1-1v-.7l-3.1-3.1-.4.3-.7-.8.8-.6a.5.5 0 0 1 .7 0l2.7 2.8V3.4Z"/>
                                                    </g></svg>`;

    private static readonly SPINNER_SVG: SVGSVGElement = (() => {
        const svgNS = "http://www.w3.org/2000/svg";

        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", "50");
        svg.setAttribute("height", "50");
        svg.setAttribute("viewBox", "0 0 50 50");

        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", "25");
        circle.setAttribute("cy", "25");
        circle.setAttribute("r", "20");
        circle.setAttribute("stroke", "#999");
        circle.setAttribute("stroke-width", "7");
        circle.setAttribute("fill", "none");
        circle.setAttribute("stroke-linecap", "round");
        circle.setAttribute("stroke-dasharray", "94.2 31.4");

        const animate = document.createElementNS(svgNS, "animateTransform");
        animate.setAttribute("attributeName", "transform");
        animate.setAttribute("type", "rotate");
        animate.setAttribute("from", "0 25 25");
        animate.setAttribute("to", "360 25 25");
        animate.setAttribute("dur", "1s");
        animate.setAttribute("repeatCount", "indefinite");
        circle.appendChild(animate);
        svg.appendChild(circle);

        return svg;
    })();

    private static readonly ICONS: { [key: string]: IconData } = {
        play: { viewBox: "0 0 24 24", path: "M8 5v14l11-7z" },
        pause: { viewBox: "0 0 24 24", path: "M6 19h4V5H6v14zm8-14v14h4V5h-4z" },
        goToStart: { viewBox: "0 0 24 24", path: "M6 6h2v12H6zm3.5 6l8.5 6V6z" },
        stepBack: { viewBox: "0 0 24 24", path: "M11 18V6l-8.5 6 8.5 6zm-2-6l6 4.5V7.5l-6 4.5z" },
        stepForward: { viewBox: "0 0 24 24", path: "M13 6v12l8.5-6-8.5-6zm2 6l-6-4.5v9l6-4.5z" },
        goToEnd: { viewBox: "0 0 24 24", path: "M16 6h2v12h-2zm-3.5 6l-8.5 6V6z" },
        loop: { viewBox: "0 0 24 24", path: "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" },
        upArrow: { viewBox: "0 0 24 24", path: "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" }
    };

    constructor(options: RenderedOptions) {
        this.selectionManager = options.selectionManager;
        this.controlsWrapper = options.controlsWrapper;
        this.progressIndicator = options.progressIndicator;
        this.imageContainer = options.imageContainer;
        this.captionContainer = options.captionContainer;
        this.currentImageElement = options.currentImageElement;
        this.nextImageElement = options.nextImageElement
        this.imageFrames = [];
        this.visualSettings = {} as VisualFormattingSettingsModel;
        this.tooltipServiceWrapper = options.tooltipServiceWrapper;

        this.initSpinner();
        this.setupControls();
    }

    public render(imageFrames: ImageFrame[], visualSettings: VisualFormattingSettingsModel) {
        this.imageFrames = imageFrames;
        this.visualSettings = visualSettings;
        this.currentIndex = 0;
        this.oldIndex = -1;
        this.renderFrame(this.currentIndex, this.oldIndex);
        if (imageFrames.length === 0) return;

        const firstFrame = imageFrames[this.currentIndex];

        if (!this.isInitialLoading) {
            this.currentImageElement.style("display", "none");
            this.spinnerElement.style("display", "block");
            this.isInitialLoading = true;
        }

        // Load the first image (will use cache if available)
        this.loadAndDecode(firstFrame.imageUri).then(decodedImg => {
            if (this.isInitialLoading) {
                this.spinnerElement.style("display", "none");
                this.currentImageElement.style("display", "block");
                this.isInitialLoading = false;
            }

            if (!decodedImg) return;

            // Render the first frame
            this.renderFrame(this.currentIndex, this.oldIndex);
        });
    }

    private renderFrame(currentIndex: number, oldIndex: number, isSteppingForward: boolean = true) {
        if (!this.imageFrames || !this.imageFrames[currentIndex] || this.isTransitioning) {
            return;
        }

        this.isFallbackImage = false;

        const frames = this.imageFrames;
        const frame = frames[currentIndex];
        const nextIndex = (currentIndex + 1) % frames.length;
        this.preloadImage(nextIndex);

        this.loadAndDecode(frame.imageUri).then((decodedImg) => {
            console.log("Image loaded:", frame.imageUri);
            if (this.currentIndex !== currentIndex || !decodedImg) {
                return; // Abort if state changed while image was loading (race condition)
            }

            const { show: hasTransition, transitionType, transitionDuration } =
                this.visualSettings.transitionCard;
            const shouldAnimate = oldIndex !== -1 && currentIndex !== oldIndex && hasTransition.value;

            this.applyTransition(
                decodedImg,
                shouldAnimate ? transitionType.value.value as string : "fade",
                shouldAnimate ? transitionDuration.value : 0,
                isSteppingForward
            );
        });

        const newCaption = this.visualSettings.captionCard.show.value ? frame.caption : "";

        // Update caption container
        this.captionContainer.text(newCaption);

        // Update image alt text
        const altText = this.isFallbackImage ? "Error image" : (newCaption || "Image");
        this.currentImageElement.attr("alt", altText);

        const dots = this.progressIndicator.selectAll<HTMLDivElement, ImageFrame>(".dot").data(frames);

        dots.exit().remove();

        const dotsEnter = dots.enter().append("div").classed("dot", true)
            .on("click", (event, d) => {
                if (this.isTransitioning) return;
                this.selectFrameById(d.identity);
            });

        dotsEnter.merge(dots)
            .classed("active", (d, i) => i === currentIndex)
            .style("opacity", d => d.opacity);

        this.imageContainer.on("click", () => this.selectFrameById(frame.identity));

        this.tooltipServiceWrapper.addTooltip(
            this.progressIndicator.selectAll(".dot"),
            (datum: ImageFrame) => datum.tooltips,
            (datum: ImageFrame) => datum.identity
        );

        this.tooltipServiceWrapper.addTooltip(
            this.imageContainer,
            () => frames[currentIndex].tooltips,
            () => frames[currentIndex].identity
        );
    }

    private initSpinner() {
        if (!this.spinnerElement) {
            this.spinnerElement = this.imageContainer.append("div")
                .classed("spinner", true); // styles handled in CSS

            // Append static SVG once
            this.spinnerElement.node()?.appendChild(Renderer.SPINNER_SVG);
        }
    }

    private useFallbackSvg(svgString: string): HTMLImageElement {
        const fallbackImage = new Image();
        const encodedSvg = encodeURIComponent(svgString);
        fallbackImage.src = `data:image/svg+xml,${encodedSvg}`;
        this.isFallbackImage = true;
        return fallbackImage;
    }

    private async loadAndDecode(src: string): Promise<HTMLImageElement> {
        if (!src) {
            // immediately return fallback, no need to assign .src
            return this.useFallbackSvg(Renderer.FALLBACK_SVG);
        }

        const cached = this.imageCache.get(src);
        if (cached) {
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

        const img = new Image();
        const wait = new Promise<HTMLImageElement>(resolve => {
            img.onload = () => resolve(img);
            img.onerror = () => resolve(this.useFallbackSvg(Renderer.FALLBACK_SVG));
        });
        img.src = src;

        const loadedImage = await wait;
        if (typeof (loadedImage as any).decode === "function") {
            try { await loadedImage.decode(); } catch { /* ignore */ }
        }

        this.imageCache.set(src, loadedImage);
        this.evictOldestIfNeeded();

        return loadedImage;
    }

    private evictOldestIfNeeded() {
        while (this.imageCache.size > this.maxCacheEntries) {
            const oldestKey = this.imageCache.keys().next().value;
            this.imageCache.delete(oldestKey);
        }
    }

    private applyTransition(newImageElement: HTMLImageElement, type: string, duration: number, forward: boolean) {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        const standbyNode = this.nextImageElement.node();
        if (standbyNode?.parentNode) {
            standbyNode.parentNode.replaceChild(newImageElement, standbyNode);
        } else {
            this.imageContainer.node().appendChild(newImageElement);
        }
        this.nextImageElement = d3Select(newImageElement);

        if (duration === 0) {
            this.currentImageElement.attr("class", "standby");
            this.nextImageElement.attr("class", "active");
            const temp = this.currentImageElement;
            this.currentImageElement = this.nextImageElement;
            this.nextImageElement = temp;
            this.isTransitioning = false;
            return;
        }

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

        const nextNode = this.nextImageElement.node();
        const cleanup = () => {
            nextNode.removeEventListener('animationend', cleanup);
            clearTimeout(safetyTimeout);

            const oldCurrent = this.currentImageElement;
            this.currentImageElement = this.nextImageElement;
            this.nextImageElement = oldCurrent;

            this.currentImageElement.style("animation", null).attr("class", "active");
            this.nextImageElement.style("animation", null).attr("class", "standby");

            this.isTransitioning = false;
        };

        this.currentImageElement.attr("class", "current");
        this.nextImageElement.attr("class", "next");

        nextNode.addEventListener('animationend', cleanup, { once: true });

        const durationMs = `${duration}ms`;
        const fillMode = 'forwards';

        this.currentImageElement.style("animation", `${currentAnimation} ${durationMs} ${fillMode}`);
        this.nextImageElement.style("animation", `${nextAnimation} ${durationMs} ${fillMode}`);

        const safetyTimeout = setTimeout(cleanup, duration + 50);
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
        this.oldIndex = this.currentIndex;
        const isForward = index > this.oldIndex || (index === 0 && this.oldIndex === this.imageFrames.length - 1);
        this.currentIndex = index;
        this.renderFrame(this.currentIndex, this.oldIndex, isForward);
    }

    private async preloadImage(index: number) {
        const frames = this.imageFrames;
        if (!frames || frames.length === 0) return;

        const src = frames[index]?.imageUri;
        if (!src) return;

        try {
            await this.loadAndDecode(src);
        } catch {
            // ignore errors
        }
    }

    private pausePlayback() {
        this.isPlaying = false;
        this.updateButtonIcon(this.playPauseButton, Renderer.ICONS.play);
        clearTimeout(this.playbackTimer);
    }

    private setupControls() {
        this.createIconButton(this.controlsWrapper, Renderer.ICONS.upArrow)
            .classed("panel-indicator", true)
            .on("click", () => {
                const isExpanded = this.controlsWrapper.classed("is-expanded");
                this.controlsWrapper.classed("is-expanded", !isExpanded);
            });

        const panel = this.controlsWrapper.append("div").classed("controls-panel", true);
        const buttons = panel.append("div").classed("control-buttons", true);

        this.createIconButton(buttons, Renderer.ICONS.goToStart).on("click", () => this.goToFrame(0));
        this.createIconButton(buttons, Renderer.ICONS.stepBack).on("click", () => this.step(-1));
        this.playPauseButton = this.createIconButton(buttons, Renderer.ICONS.play).on("click", () => this.togglePlayback());
        this.createIconButton(buttons, Renderer.ICONS.stepForward).on("click", () => this.step(1));
        this.createIconButton(buttons, Renderer.ICONS.goToEnd).on("click", () => this.goToFrame(this.imageFrames.length - 1));
        this.createIconButton(buttons, Renderer.ICONS.loop)
            .classed("loop-toggle", true)
            .on("click", (event) => {
                this.isLooping = !this.isLooping;
                d3Select(event.currentTarget).classed("active", this.isLooping);
            });
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
        this.updateButtonIcon(this.playPauseButton, Renderer.ICONS.pause);
        this.playbackLoop();
    }

    private playbackLoop() {

        if (!this.isPlaying) return;

        const frames = this.imageFrames;
        if (frames.length <= 1 && frames[0].identity === null) {
            this.pausePlayback();
            return;
        }

        this.playbackTimer = window.setTimeout(() => {

            const nextIndex = this.isLooping
                ? (this.currentIndex + 1) % frames.length
                : this.currentIndex + 1;

            if (!this.isLooping && nextIndex >= frames.length) {
                this.pausePlayback();
                return;
            }

            if (this.visualSettings.playbackCard.selectionSequence.value) {
                this.selectionManager.clear();
                this.selectionManager.select(frames[nextIndex].identity);
            }

            this.goToFrame(nextIndex, true);
            this.playbackLoop();
        }, this.visualSettings.playbackCard.defaultFrameDuration.value);
    }

}