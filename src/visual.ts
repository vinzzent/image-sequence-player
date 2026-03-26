"use strict";

// #region IMPORTS & INTERFACES

import powerbi from "powerbi-visuals-api";
import {Selection as d3Selection} from "d3";  
import { select as d3Select} from "d3-selection";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { ITooltipServiceWrapper, createTooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import { ColorHelper } from "powerbi-visuals-utils-colorutils";
import { VisualFormattingSettingsModel } from "./settings";
import { ImageFrame } from "./common-interfaces";
import { PlayerOrchestrator } from "./player/player-orchestrator";
import {    handleContextMenu,
            buildErrorSvgString,
            isDataViewValid,
            transformDataViewToFrames,
            createAwaitingDataFrames,
            moveLabelContainer,
            moveProgressIndicator,
            updateStyling
        } from "./utils";
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import "./../style/visual.less";

// #endregion

// ===================================================================
// #region MAIN CLASS: VISUAL
// ===================================================================

export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private colorHelper: ColorHelper;    
    private allowInteractions: boolean;
    private selectionManager: ISelectionManager;
    private target: HTMLElement;
    private imageFrames: ImageFrame[];
    private formattingSettingsService: FormattingSettingsService;
    private visualSettings: VisualFormattingSettingsModel;
    private rootElement: d3Selection<HTMLDivElement, any, any, any>;
    private contentContainer: d3Selection<HTMLDivElement, any, any, any>;
    private imageContainer: d3Selection<HTMLDivElement, any, any, any>;
    private captionContainer: d3Selection<HTMLDivElement, any, any, any>;
    private controlsWrapper: d3Selection<HTMLDivElement, any, any, any>;
    private progressIndicator: d3Selection<HTMLDivElement, any, any, any>;
    private isDataValid: boolean = false;
    private PlayerOrchestrator: PlayerOrchestrator;    
    private tooltipServiceWrapper: ITooltipServiceWrapper;    
    private errorSvgString: string; 
    private static readonly INVALID_MESSAGE: string = "Please add data to \n [Category] \n and \n [Image] \n fields.";
    private static readonly BLOCK_EXTERNAL_URLS: boolean = false;
    private static readonly ONLY_HTTPS: boolean = true;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = this.host.eventService;        
        this.allowInteractions = this.host.hostCapabilities.allowInteractions;
        this.colorHelper = new ColorHelper(this.host.colorPalette);
        this.selectionManager = this.host.createSelectionManager();
        this.target = options.element;
        const localizationManager = options.host.createLocalizationManager();
        this.formattingSettingsService = new FormattingSettingsService(localizationManager);
        this.rootElement = d3Select(this.target).append("div").classed("image-sequence-player", true).classed("highcontrast", this.colorHelper.isHighContrast);
        this.contentContainer = this.rootElement.append("div").classed("content-container", true);
        this.captionContainer = this.contentContainer.append("div").classed("caption-container", true);
        this.imageContainer = this.contentContainer.append("div").classed("image-container", true);
        this.progressIndicator = this.rootElement.append("div").classed("progress-indicator", true);
        this.controlsWrapper = this.rootElement.append("div").classed("controls-wrapper", true);
        handleContextMenu(this.selectionManager, this.rootElement);
        this.imageFrames = [];        
        this.errorSvgString = buildErrorSvgString(this.colorHelper);
        this.tooltipServiceWrapper = createTooltipServiceWrapper(
            this.host.tooltipService,
            options.element
        );
        this.PlayerOrchestrator = new PlayerOrchestrator({
            allowInteractions: this.allowInteractions,
            selectionManager: this.selectionManager,
            tooltipServiceWrapper: this.tooltipServiceWrapper,
            errorSvgString: this.errorSvgString,
            controlsWrapper: this.controlsWrapper,
            progressIndicator: this.progressIndicator,
            imageContainer: this.imageContainer,
            captionContainer: this.captionContainer
        });
    }

    /**
    * Updates the visual with new data and formatting, rendering frames and applying styles.
    * @param options VisualUpdateOptions containing dataViews and viewport information.
    * @returns A Promise that resolves once rendering is complete.
    */
    public async update(options: VisualUpdateOptions): Promise<void> {
        this.events.renderingStarted(options);
        const dataView = options.dataViews && options.dataViews[0];
        this.visualSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
        
        this.isDataValid = isDataViewValid(dataView);

        // Get the view model (either real or placeholder)
        if (this.isDataValid) {
            this.imageFrames = transformDataViewToFrames(dataView, this.visualSettings, this.host, Visual.BLOCK_EXTERNAL_URLS, Visual.ONLY_HTTPS);
        } else {
            this.imageFrames = createAwaitingDataFrames(Visual.INVALID_MESSAGE, this.colorHelper);
        }

        // --- Centralized UI State Logic ---
        this.rootElement.classed("is-invalid", !this.isDataValid);

        if (this.isDataValid) {
            moveLabelContainer(
                this.visualSettings.captionCard.position.value.value as "top" | "bottom", 
                this.captionContainer, 
                this.imageContainer
            );
            moveProgressIndicator(
                this.visualSettings.navigationCard.generalDotSettings.position.value.value as "top" | "bottom",
                this.rootElement,
                this.progressIndicator,
                this.contentContainer
            );
            
            updateStyling(this.visualSettings,
                this.colorHelper,
                this.rootElement,
                this.imageContainer,
                this.progressIndicator,
                this.captionContainer,
                this.controlsWrapper
            );
        }

        await this.PlayerOrchestrator.render(this.imageFrames, this.visualSettings);
        this.events.renderingFinished(options);
    }

    /**
    * Returns the current visual formatting model based on applied settings.
    * @returns A Power BI FormattingModel representing the visual's formatting configuration.
    */
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.visualSettings);
    }    
}

// #endregion
