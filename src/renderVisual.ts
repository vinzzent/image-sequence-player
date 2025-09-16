import { VisualFormattingSettingsModel } from "./settings";
import { interpolate as d3Interpolate } from "d3-interpolate";
import { transition as d3Transition } from "d3-transition";
import { select as d3Select, Selection } from "d3-selection";
import { ITooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import { timeout, Timer } from "d3-timer";
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
    tooltipServiceWrapper: ITooltipServiceWrapper;
}

enum PlayerState {
    Idle,
    Loading,
    Playing,
    Paused,
    Transitioning
}

export class Renderer {
    private selectionManager: ISelectionManager;
    private imageFrames: ImageFrame[];
    private visualSettings: VisualFormattingSettingsModel;
    private tooltipServiceWrapper: ITooltipServiceWrapper;
    private imageContainer: d3.Selection<HTMLDivElement, any, any, any>;
    private captionContainer: d3.Selection<HTMLDivElement, any, any, any>;
    private controlsWrapper: d3.Selection<HTMLDivElement, any, any, any>;
    private controlsPanel: d3.Selection<HTMLDivElement, any, any, any>;
    private controlButtons: d3.Selection<HTMLDivElement, any, any, any>;
    private progressIndicator: d3.Selection<HTMLDivElement, any, any, any>;
    private playPauseButton: d3.Selection<HTMLButtonElement, any, any, any>;
    private spinnerElement: d3.Selection<HTMLDivElement, any, any, any>;
    private spinnerSvg: d3.Selection<SVGSVGElement, any, any, any>;

    private playerState: PlayerState = PlayerState.Idle;
    private currentIndex: number = 0;
    private isLooping: boolean = false;
    private playbackTimer: Timer;
    private isInitialLoad: boolean = true;
    private imageCache: Map<string, HTMLImageElement> = new Map();
    private readonly maxCacheEntries: number = 10;

    constructor(options: RenderedOptions) {
        this.selectionManager = options.selectionManager;
        this.controlsWrapper = options.controlsWrapper;
        this.progressIndicator = options.progressIndicator;
        this.imageContainer = options.imageContainer;
        this.captionContainer = options.captionContainer;
        this.tooltipServiceWrapper = options.tooltipServiceWrapper;
        this.controlsPanel = this.controlsWrapper.append("div").classed("controls-panel", true);
        this.controlButtons = this.controlsPanel.append("div").classed("control-buttons", true);
        this.spinnerElement = this.imageContainer.append("div").classed("spinner", true);
        this.spinnerSvg = this.spinnerElement.append("svg");
        this.setupSpinner();
        this.setupControls();
    }

    public async render(imageFrames: ImageFrame[], visualSettings: VisualFormattingSettingsModel): Promise<void> {
        this.imageFrames = imageFrames;
        this.visualSettings = visualSettings;

        if (this.playerState === PlayerState.Playing || this.playerState === PlayerState.Transitioning) {
            this.pausePlayback();
        }
        if (this.playbackTimer) {
            this.playbackTimer.stop();
        }

        if (!imageFrames || imageFrames.length === 0) {
            this.playerState = PlayerState.Idle;
            this.imageContainer.selectAll("img").remove();
            this.captionContainer.text("");
            this.progressIndicator.selectAll(".dot").remove();
            return;
        }

        this.imageContainer.selectAll("img").remove();

        //this.isInitialLoad = true;

        //if (this.isInitialLoad) {
        this.playerState = PlayerState.Loading;
        this.spinnerElement.classed("visible", true);
        //this.progressIndicator.classed("hidden", true);
        this.imageContainer.selectAll("img").style("opacity", 0);
        //}

        try {
            await this.loadAndDecode(imageFrames[0].imageUri);
            //if (this.isInitialLoad) {
            this.spinnerElement.classed("visible", false);
            //this.isInitialLoad = false;
            //}
            await this.navigateToFrame(0, 0); // Render first frame instantly
            this.playerState = PlayerState.Paused;
        } catch (error) {
            console.error("Error during initial render:", error);
            this.playerState = PlayerState.Idle;
        }
    }

    private async navigateToFrame(index: number, duration?: number): Promise<void> {
        //if (this.playerState === PlayerState.Transitioning || !this.imageFrames[index]) return;
        if (!this.imageFrames[index]) return;

        const previousState = this.playerState;
        this.playerState = PlayerState.Transitioning;

        const oldIndex = this.currentIndex;
        this.currentIndex = index;

        const isSteppingForward = index > oldIndex || (index === 0 && oldIndex === this.imageFrames.length - 1);
        const transitionDuration = duration ?? (this.visualSettings.transitionCard.show.value ? this.visualSettings.transitionCard.transitionDuration.value : 0);

        try {
            await this.renderFrame(this.currentIndex, isSteppingForward, transitionDuration);
        } catch (error) {
            console.error(`Error navigating to frame ${index}:`, error);
        } finally {
            if (this.playerState === PlayerState.Transitioning) {
                this.playerState = (previousState === PlayerState.Playing)
                    ? PlayerState.Playing
                    : PlayerState.Paused;
            }
        }
    }

    private async renderFrame(currentIndex: number, isForward: boolean, duration: number): Promise<void> {
        const frame = this.imageFrames[currentIndex];
        if (!frame) return;

        // Preload next image
        const nextIndex = (currentIndex + 1) % this.imageFrames.length;
        this.preloadImage(nextIndex);

        // Update caption
        const newCaption = this.visualSettings.captionCard.show.value ? frame.caption : "";
        this.captionContainer.text(newCaption);

        // Update progress dots
        const dots = this.progressIndicator.selectAll<HTMLDivElement, ImageFrame>(".dot").data(this.imageFrames);
        dots.enter().append("div").classed("dot", true)
            .on("click", (event, d) => {
                const i = this.imageFrames.findIndex(f => f.identity.equals(d.identity));
                if (i !== -1) this.goToFrameFromButton(i);
            })
            .merge(dots)
            .classed("active", (d, i) => i === currentIndex)
            .style("opacity", d => d.opacity);

        // Tooltip setup
        this.imageContainer.on("click", () => this.selectFrameById(frame.identity));
        this.tooltipServiceWrapper.addTooltip(
            this.progressIndicator.selectAll(".dot"),
            (datum: ImageFrame) => datum.tooltips,
            (datum: ImageFrame) => datum.identity
        );
        this.tooltipServiceWrapper.addTooltip(
            this.imageContainer,
            () => this.imageFrames[currentIndex].tooltips,
            () => this.imageFrames[currentIndex].identity
        );

        // Await the D3 transition
        const transitionType = this.visualSettings.transitionCard.transitionType.value.value as string;
        await this.applyD3Transition(frame, duration, transitionType, isForward);
    }

    private async applyD3Transition(
        frame: ImageFrame,
        duration: number,
        type: string,
        isForward: boolean
    ): Promise<void> {
        const loadedImg = await this.loadAndDecode(frame.imageUri);        
        this.imageContainer.selectAll<HTMLImageElement, any>("img").interrupt()
        this.imageContainer
            .selectAll<HTMLImageElement, any>("img.exiting-image")
            .remove();

        // 1. Set up clear, reusable constants
        const axis = type === "slideHorizontal" ? "X" : "Y";
        const isSlide = type === "slideHorizontal" || type === "slideVertical";
        const startValue = isForward ? 100 : -100;
        const endValue = -startValue;

        const images = this.imageContainer
            .selectAll<HTMLImageElement, ImageFrame>("img")
            .data([frame], d => d.identity === null ? `__frame_${d.imageUri}_${Math.random()}` : d.identity.getKey());

        const exitSelection = images.exit().attr("class", "exiting-image");

        const enterSelection = images.enter()
            .append("img")
            .attr("src", loadedImg.src)
            .attr("alt", frame.caption || "Image")
            .attr("class", "entered-image")
            .style("position", "absolute")
            .style("top", "0px")
            .style("left", "0px")
            .style("will-change", "transform, opacity")
            .style("opacity", 0)
            .style("transform", isSlide ? `translate${axis}(${startValue}%)` : null);


        return new Promise(resolve => {
            const t = d3Transition().duration(duration);
            let activeTransitions = 0;

            const onTransitionEnd = () => {
                activeTransitions--;
                if (activeTransitions === 0) {
                    this.imageContainer.selectAll("img").order();
                    resolve();
                }
            };

            // Animate entering selection
            if (!enterSelection.empty()) {
                activeTransitions++;
                const transition = enterSelection.transition(t);
                if (isSlide) {
                    transition.styleTween("transform", () => {
                        const interp = d3Interpolate(startValue, 0);
                        return time => `translate${axis}(${interp(time)}%)`;
                    });
                }
                transition.style("opacity", 1)
                    .on("end", () => {
                        enterSelection.style("will-change", null);
                        onTransitionEnd();
                    });
            }

            // Animate exiting selection
            if (!exitSelection.empty()) {
                activeTransitions++;
                exitSelection.style("will-change", "transform, opacity");
                const transition = exitSelection.transition(t);
                if (isSlide) {
                    transition.styleTween("transform", () => {
                        const interp = d3Interpolate(0, endValue);
                        return time => `translate${axis}(${interp(time)}%)`;
                    });
                }
                transition.style("opacity", 0)
                    .on("end", onTransitionEnd)
                    .remove();
            }

            if (activeTransitions === 0) {
                resolve();
            }
        });
    }

    private async goToFrame(index: number): Promise<void> {
        if (this.playerState === PlayerState.Playing || this.playerState === PlayerState.Transitioning) {
            this.pausePlayback();
        }
        await this.navigateToFrame(index);
    }

    private async goToFrameFromButton(index: number): Promise<void> {
        if (this.playerState === PlayerState.Playing || this.playerState === PlayerState.Transitioning) {
            this.pausePlayback();
        }
        await this.navigateToFrame(index, 100);
    }

    private async stepFrame(direction: number) {
        const frameCount = this.imageFrames.length;
        if (frameCount <= 1) return;
        let newIndex = this.currentIndex + direction;

        if (newIndex >= frameCount) {
            newIndex = this.isLooping ? 0 : frameCount - 1;
        } else if (newIndex < 0) {
            newIndex = this.isLooping ? frameCount - 1 : 0;
        }        
        await this.goToFrameFromButton(newIndex);
    }

    private togglePlayback() {
        if (this.playerState === PlayerState.Playing || this.playerState === PlayerState.Transitioning) {
            this.pausePlayback();
        } else if (this.playerState === PlayerState.Paused) {
            this.startPlayback();
        }
    }

    private startPlayback() {
        if (this.playerState !== PlayerState.Paused && this.playerState !== PlayerState.Idle) return;
        this.playerState = PlayerState.Playing;
        this.updateButtonIcon(this.playPauseButton, Renderer.ICONS.pause);
        this.playbackLoop();
    }

    private pausePlayback() {
        if (this.playerState !== PlayerState.Playing && this.playerState !== PlayerState.Transitioning) return;
        this.playerState = PlayerState.Paused;
        this.updateButtonIcon(this.playPauseButton, Renderer.ICONS.play);
        if (this.playbackTimer) {
            this.playbackTimer.stop();
        }
    }

    private async playbackLoop() {
        while (this.playerState === PlayerState.Playing) {
            const frames = this.imageFrames;
            if (!frames || frames.length <= 1) {
                this.pausePlayback();
                break;
            }

            const displayTime = this.visualSettings.playbackCard.defaultFrameDuration.value;
            await this.delay(displayTime);
            if (this.playerState !== PlayerState.Playing) break;

            const nextIndex = (this.currentIndex + 1) % frames.length;
            if (!this.isLooping && nextIndex === 0) {
                this.pausePlayback();
                this.goToFrame(this.imageFrames.length - 1);
                break;
            }

            if (this.visualSettings.playbackCard.selectionSequence.value) {
                this.selectionManager.clear();
                this.selectionManager.select(frames[nextIndex].identity);
            }
            if (this.playerState !== PlayerState.Playing) break;
            await this.navigateToFrame(nextIndex);
            if (this.playerState !== PlayerState.Playing) break;
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => {
            if (this.playbackTimer) this.playbackTimer.stop();
            this.playbackTimer = timeout(() => resolve(), ms);
        });
    }

    private selectFrameById(identity: ISelectionId) {
        if (!identity) return;
        this.selectionManager.select(identity);
        const index = this.imageFrames.findIndex(f => f.identity && f.identity.equals(identity));
        if (index !== -1) {
            this.goToFrame(index);
        }
    }

    private async preloadImage(index: number) {
        const frames = this.imageFrames;
        if (!frames || frames.length === 0) return;
        const src = frames[index]?.imageUri;
        if (!src) return;
        try { await this.loadAndDecode(src); } catch { /* ignore */ }
    }

    private async loadAndDecode(src: string): Promise<HTMLImageElement> {
        if (!src) return this.useFallbackSvg();

        const cached = this.imageCache.get(src);
        if (cached) {
            this.imageCache.delete(src);
            this.imageCache.set(src, cached);
            if (typeof cached.decode === "function") {
                try { await cached.decode(); } catch { /* ignore */ }
            } else if (!cached.complete) {
                await new Promise<void>(r => { cached.onload = () => r(); cached.onerror = () => r(); });
            }
            return cached;
        }

        const img = new Image();
        let isLoadSuccessful = false;
        const wait = new Promise<HTMLImageElement>(resolve => {
            img.onload = () => { isLoadSuccessful = true; resolve(img); };
            img.onerror = () => { resolve(this.useFallbackSvg()); };
        });
        img.src = src;
        const loadedImage = await wait;
        if (typeof loadedImage.decode === "function") {
            try { await loadedImage.decode(); } catch { /* ignore */ }
        }
        if (isLoadSuccessful) {
            this.imageCache.set(src, loadedImage);
            this.evictOldestIfNeeded();
        }
        return loadedImage;
    }

    private setupControls() {
        this.createIconButton(this.controlsWrapper, Renderer.ICONS.upArrow)
            .classed("panel-indicator", true)
            .on("click", () => {
                const isExpanded = this.controlsWrapper.classed("is-expanded");
                this.controlsWrapper.classed("is-expanded", !isExpanded);
            });

        this.createIconButton(this.controlButtons, Renderer.ICONS.goToStart).on("click", () => this.goToFrameFromButton(0));
        this.createIconButton(this.controlButtons, Renderer.ICONS.stepBack).on("click", () => this.stepFrame(-1));
        this.playPauseButton = this.createIconButton(this.controlButtons, Renderer.ICONS.play).on("click", () => this.togglePlayback());
        this.createIconButton(this.controlButtons, Renderer.ICONS.stepForward).on("click", () => this.stepFrame(1));
        this.createIconButton(this.controlButtons, Renderer.ICONS.goToEnd).on("click", () => this.goToFrameFromButton(this.imageFrames.length - 1));
        this.createIconButton(this.controlButtons, Renderer.ICONS.loop)
            .classed("loop-toggle", true)
            .on("click", (event) => {
                this.isLooping = !this.isLooping;
                d3Select(event.currentTarget).classed("active", this.isLooping);
            });
    }

    private setupSpinner() {
        this.spinnerSvg.attr("width", 50).attr("height", 50).attr("viewBox", "0 0 50 50");
        const circle = this.spinnerSvg.append("circle")
            .attr("cx", 25).attr("cy", 25).attr("r", 20).attr("stroke", "#605E5C")
            .attr("stroke-width", 7).attr("fill", "none").attr("stroke-linecap", "round")
            .attr("stroke-dasharray", "94.2 31.4");
        circle.append("animateTransform").attr("attributeName", "transform").attr("type", "rotate")
            .attr("from", "0 25 25").attr("to", "360 25 25").attr("dur", "1s").attr("repeatCount", "indefinite");
    }

    private useFallbackSvg(): HTMLImageElement {
        const fallbackImage = new Image();
        const svgStr = this.buildFallbackSvgString("#FF0000", "#000000", 0.4);
        fallbackImage.src = `data:image/svg+xml,${encodeURIComponent(svgStr)}`;
        return fallbackImage;
    }

    private buildFallbackSvgString(lineColor: string, bgColor: string, opacity: number): string {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 20.8 20.8"><g opacity="${opacity}"><path d="m20 20.8.8-.8L.8 0 0 .8Z" fill="${lineColor}"/><path d="M15.4 6.9a1.5 1.5 0 1 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5ZM1.4 18.4v-.5l3-3a1.5 1.5 0 0 0 .6.2 1.4 1.4 0 0 0 1-.4l3-3-.8-.6L5.4 14a.5.5 0 0 1-.7 0 .5.5 0 0 0-.7 0l-2.6 2.4V4.2l-1-1v16.2h16.2l-1-1z" fill="${bgColor}"/><path d="m6.2 3.4-1-1h15.2v15.2l-1-1v-.7l-3.1-3.1-.4.3-.7-.8.8-.6a.5.5 0 0 1 .7 0l2.7 2.8V3.4Z" fill="${bgColor}"/></g></svg>`;
    }

    private evictOldestIfNeeded() {
        while (this.imageCache.size > this.maxCacheEntries) {
            const oldestKey = this.imageCache.keys().next().value;
            this.imageCache.delete(oldestKey);
        }
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
}