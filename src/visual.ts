"use strict";

import powerbi from "powerbi-visuals-api";
import { select as d3Select, Selection } from "d3-selection";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel } from "./settings";

import IVisual = powerbi.extensibility.visual.IVisual;
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
    imageUrl: string;
    label: string;
}

interface ImageSequenceViewModel {
    frames: ImageFrame[];
    settings: VisualFormattingSettingsModel;
}

interface IconData {
    viewBox: string;
    path: string;
}

export class Visual implements IVisual {
    private host: IVisualHost;
    private selectionManager: ISelectionManager;
    private target: HTMLElement;
    private viewModel: ImageSequenceViewModel;
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
        this.selectionManager = this.host.createSelectionManager();
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();

        this.rootElement = d3Select(this.target).append("div").classed("image-sequence-player", true);
        this.contentContainer = this.rootElement.append("div").classed("content-container", true);
        this.labelContainer = this.contentContainer.append("div").classed("label-container", true);
        this.imageContainer = this.contentContainer.append("div").classed("image-container", true);
        
        // Initialize both image elements
        this.currentImageElement = this.imageContainer.append("img").attr("alt", "Image Frame 1").classed("active", true);
        this.nextImageElement = this.imageContainer.append("img").attr("alt", "Image Frame 2").classed("standby", true);

        this.setupControls();
    }

    public update(options: VisualUpdateOptions) {
        const dataView = options.dataViews && options.dataViews[0];
        this.visualSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
        this.viewModel = this.visualTransform(dataView, this.visualSettings);
        
        const { frames, settings } = this.viewModel;
        
        const oldIndex = this.currentIndex;
        this.currentIndex = Math.max(0, Math.min(this.currentIndex, frames.length - 1));
        
        this.render(this.currentIndex, -1);
        this.updateStyling(settings);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.visualSettings);
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

    private visualTransform(dataView: DataView, settings: VisualFormattingSettingsModel): ImageSequenceViewModel {
        const categorical = dataView && dataView.categorical;
        if (!categorical || !categorical.categories || !categorical.values) {
            return this.createPlaceholderViewModel(settings);
        }

        const sequenceData = categorical.categories[0];
        const imageData = categorical.values.find(v => v.source.roles["imageUrl"]);
        const labelData = categorical.values.find(v => v.source.roles["label"]);

        if (!sequenceData || !sequenceData.values || sequenceData.values.length === 0 || !imageData) {
            return this.createPlaceholderViewModel(settings);
        }
        
        const frames: ImageFrame[] = [];
        for (let i = 0; i < sequenceData.values.length; i++) {
            const identity = this.host.createSelectionIdBuilder()
                .withCategory(sequenceData, i)
                .createSelectionId();

            const frame: ImageFrame = {
                identity,
                imageUrl: imageData.values[i] as string,
                label: labelData ? labelData.values[i] as string : ''
            };
            frames.push(frame);
        }
        
        return { frames, settings };
    }

    private createPlaceholderViewModel(settings: VisualFormattingSettingsModel): ImageSequenceViewModel {
        const placeholderSvg = Visual.createPlaceholderSvg("Please add data to 'Sequence' and 'Image URL or SVG Text' fields.");
        const placeholderFrame: ImageFrame = {
            identity: null,
            imageUrl: placeholderSvg,
            label: "Awaiting data"
        };
        return { frames: [placeholderFrame], settings };
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
        
        const indicatorButton = this.createIconButton(this.controlsWrapper, Visual.ICONS.upArrow)
            .classed("panel-indicator", true)
            .on("click", () => {
                const isExpanded = this.controlsWrapper.classed("is-expanded");
                this.controlsWrapper.classed("is-expanded", !isExpanded);
            });

        const panel = this.controlsWrapper.append("div").classed("controls-panel", true);
        this.progressIndicator = panel.append("div").classed("progress-indicator", true);
        const buttons = panel.append("div").classed("control-buttons", true);

        this.createIconButton(buttons, Visual.ICONS.goToStart).on("click", () => this.goToFrame(0));
        this.createIconButton(buttons, Visual.ICONS.stepBack).on("click", () => this.step(-1));
        this.playPauseButton = this.createIconButton(buttons, Visual.ICONS.play).on("click", () => this.togglePlayback());
        this.createIconButton(buttons, Visual.ICONS.stepForward).on("click", () => this.step(1));
        this.createIconButton(buttons, Visual.ICONS.goToEnd).on("click", () => this.goToFrame(this.viewModel.frames.length - 1));
        this.createIconButton(buttons, Visual.ICONS.loop)
            .classed("loop-toggle", true)
            .on("click", (event) => {
                this.isLooping = !this.isLooping;
                d3Select(event.currentTarget).classed("active", this.isLooping);
            });
    }

    private render(newIndex: number, oldIndex: number, isSteppingForward: boolean = true) {
        if (!this.viewModel || !this.viewModel.frames[newIndex] || this.isTransitioning) {
            return;
        }
    
        const { frames } = this.viewModel;
        const newFrame = frames[newIndex];
    
        const transitionType = this.visualSettings.transitionCard.transitionType.value.value as string;
        const transitionDuration = this.visualSettings.transitionCard.transitionDuration.value;

        // On the very first render, just set the image source without transition
        if (oldIndex === -1) {
            this.currentImageElement.attr("src", newFrame.imageUrl);
        } else if (newIndex !== oldIndex) {
            this.applyTransition(newFrame.imageUrl, transitionType, transitionDuration, isSteppingForward);
        }
    
        const newLabel = this.visualSettings.labelCard.show.value ? newFrame.label : "";
        this.labelContainer.text(newLabel);
    
        const dots = this.progressIndicator.selectAll(".dot").data(frames);
        dots.enter().append("div").classed("dot", true)
            .on("click", (event, d) => this.selectFrameById(d.identity));
        dots.classed("active", (d, i) => i === newIndex);
        dots.exit().remove();
        
        this.imageContainer.on("click", () => this.selectFrameById(newFrame.identity));
    }

    private applyTransition(newImageUrl: string, type: string, duration: number, forward: boolean) {
        if (this.isTransitioning) return;
        this.isTransitioning = true;
    
        this.nextImageElement.attr("src", newImageUrl);
        this.currentImageElement.style("transition-duration", `${duration}ms`);
        this.nextImageElement.style("transition-duration", `${duration}ms`);
    
        const exitClass = `exit-${type}${type.startsWith('slide') ? (forward ? '-fwd' : '-rev') : ''}`;
        const enterClass = `enter-${type}${type.startsWith('slide') ? (forward ? '-fwd' : '-rev') : ''}`;
    
        if (type !== 'none') {
            this.currentImageElement.classed(exitClass, true);
            this.nextImageElement.classed(enterClass, true);
        }
    
        setTimeout(() => {
            this.currentImageElement
                .classed(exitClass, false)
                .attr("src", newImageUrl);
    
            this.nextImageElement.classed(enterClass, false);

            this.isTransitioning = false;
        }, type === 'none' ? 0 : duration);
    }
    
    private updateStyling(settings: VisualFormattingSettingsModel) {
        const general = settings.generalCard;
        const labels = settings.labelCard;

        this.rootElement
            .style("background-color", general.backgroundColor.value.value)
            .classed("label-above", labels.position.value.value === 'above');
            
        const alignment = general.imageAlignment.value.value as string;
        this.imageContainer.selectAll("img").style("object-fit", alignment);

        this.labelContainer
            .style("display", labels.show.value ? "block" : "none")
            .style("font-family", labels.font.fontFamily.value)
            .style("font-size", `${labels.font.fontSize.value}pt`)
            .style("font-weight", labels.font.bold.value ? "bold" : "normal")
            .style("font-style", labels.font.italic.value ? "italic" : "normal")
            .style("color", labels.labelColor.value.value);
    }
    
    private playbackLoop() {
        if (!this.isPlaying) return;
        
        const { frames } = this.viewModel;
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
        const index = this.viewModel.frames.findIndex(f => f.identity && f.identity.equals(identity));
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
        const isForward = index > oldIndex || (index === 0 && oldIndex === this.viewModel.frames.length - 1);
        this.currentIndex = index;
        this.render(this.currentIndex, oldIndex, isForward);
    }
    
    private step(direction: number) {
        if (this.isTransitioning) return;
        
        if (this.isPlaying) {
            this.pausePlayback();
        }
        
        const { frames } = this.viewModel;
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