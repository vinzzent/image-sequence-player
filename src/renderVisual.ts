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
    private currentIndex: number = 0;
    private oldIndex: number = -1;
    private isPlaying: boolean = false;
    private isLooping: boolean = false;
    private playbackTimer: number;
    private isTransitioning: boolean = false;
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

        this.setupControls();

    }

    public render(imageFrames: ImageFrame[], visualSettings: VisualFormattingSettingsModel) {
        this.imageFrames = imageFrames;
        this.visualSettings = visualSettings;
        this.currentIndex = 0;
        this.oldIndex = -1;
        this.renderFrame(this.currentIndex, this.oldIndex);
    }

    private renderFrame(currentIndex: number, oldIndex: number, isSteppingForward: boolean = true) {
        if (!this.imageFrames || !this.imageFrames[currentIndex] || this.isTransitioning) {
            return;
        }

        const frames = this.imageFrames;
        const nextIndex = (currentIndex + 1) % frames.length;
        this.preloadImage(nextIndex);
        const frame = frames[currentIndex];
        const shouldAnimate = oldIndex !== -1 && currentIndex !== oldIndex;

        if (!shouldAnimate) {
            this.currentImageElement.attr("src", frame.imageUri);
        } else {
            this.loadAndDecode(frame.imageUri).then(() => {
                const { show: hasTransition, transitionType, transitionDuration } =
                    this.visualSettings.transitionCard;
                if (hasTransition.value) {
                    this.applyTransition(
                        frame.imageUri,
                        transitionType.value.value as string,
                        transitionDuration.value,
                        isSteppingForward
                    );
                } else {
                    this.currentImageElement.attr("src", frame.imageUri);
                }
            });
        }

        const newCaption = this.visualSettings.captionCard.show.value ? frame.caption : "";
        this.captionContainer.text(newCaption);
        this.currentImageElement.attr("alt", newCaption || "Image");

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

    private selectFrameById(identity: ISelectionId) {
        if (!identity) return;
        this.selectionManager.select(identity);
        const index = this.imageFrames.findIndex(f => f.identity && f.identity.equals(identity));
        if (index !== -1) {
            //this.preloadImage(index);
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
        //this.controlsWrapper = this.rootElement.append("div").classed("controls-wrapper", true);

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