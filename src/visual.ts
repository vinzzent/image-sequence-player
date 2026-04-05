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
// === BEGIN CHANGE: Import moveIndex ===
import {    handleContextMenu,
            buildErrorSvgString,
            isDataViewValid,
            transformDataViewToFrames,
            createAwaitingDataFrames,
            moveLabelContainer,
            moveProgressIndicator,
            updateStyling,
            moveIndex
        } from "./utils";
// === END CHANGE ===
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
    // --- Freemium Licensing Directives ---
    private static readonly FREE_VERSION_MAX_FRAMES: number = 15;
    private static readonly MOCK_PRO_LICENSE: boolean = false;
    private isProLicense: boolean = false;

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
    private captionIndex: d3Selection<HTMLSpanElement, any, any, any>;
    private captionLabel: d3Selection<HTMLSpanElement, any, any, any>;
    private controlsWrapper: d3Selection<HTMLDivElement, any, any, any>;
    private progressIndicator: d3Selection<HTMLDivElement, any, any, any>;
    private isDataValid: boolean = false;
    private PlayerOrchestrator: PlayerOrchestrator;    
    private tooltipServiceWrapper: ITooltipServiceWrapper;    
    private errorSvgString: string; 
    
    // === BEGIN CHANGE: Category-only fallback mode ===
    // Updated invalid message since image field is no longer mandatory.
    private static readonly INVALID_MESSAGE: string = "Please add data to \n [Category] \n field.";
    // === END CHANGE ===
    
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
        this.captionIndex = this.captionContainer.append("span").classed("caption-index", true);
        this.captionLabel = this.captionContainer.append("span").classed("caption-label", true);
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
// === BEGIN CHANGE: Passing captionIndex and captionLabel to PlayerOrchestrator ===
        this.PlayerOrchestrator = new PlayerOrchestrator({
            allowInteractions: this.allowInteractions,
            selectionManager: this.selectionManager,
            tooltipServiceWrapper: this.tooltipServiceWrapper,
            errorSvgString: this.errorSvgString,
            controlsWrapper: this.controlsWrapper,
            progressIndicator: this.progressIndicator,
            imageContainer: this.imageContainer,
            captionContainer: this.captionContainer,
            captionIndex: this.captionIndex,
            captionLabel: this.captionLabel
        });
// === END CHANGE ===

        // --- Freemium License Verification ---
        // Validate user's available plans. If an Active plan is found, enable Pro mode.
        this.host.licenseManager.getAvailableServicePlans()
            .then((result) => {
                if (result && result.plans) {
                    const hasActivePlan = result.plans.some(
                        (plan) => plan.state === powerbi.ServicePlanState.Active
                    );
                    if (hasActivePlan) {
                        this.isProLicense = true;
                    }
                }
            })
            .catch((err) => {
                console.warn("Failed to fetch license availability", err);
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
            // === BEGIN CHANGE: Category-only fallback mode ===
            // Passed colorHelper so the fallback SVG can use theme colors dynamically
            this.imageFrames = transformDataViewToFrames(dataView, this.visualSettings, this.host, Visual.BLOCK_EXTERNAL_URLS, Visual.ONLY_HTTPS, this.colorHelper);
            // === END CHANGE ===

            // --- Applying the Freemium Limit ---
            // If the user isn't holding a valid Pro License, mock is off, and frames exceed the Free limit
            if (!this.isProLicense && !Visual.MOCK_PRO_LICENSE && this.imageFrames.length > Visual.FREE_VERSION_MAX_FRAMES) {
                // Keep only the first 15 images
                this.imageFrames = this.imageFrames.slice(0, Visual.FREE_VERSION_MAX_FRAMES);
                
                // Display the native UI warning message block
                this.host.displayWarningIcon(
                    "Free Version Limit", 
                    `Category limit reached (${Visual.FREE_VERSION_MAX_FRAMES} max). Upgrade to Pro for up to 30,000 categories.`
                );
            }
        } else {
            this.imageFrames = createAwaitingDataFrames(Visual.INVALID_MESSAGE, this.colorHelper);
        }

        // --- Centralized UI State Logic ---
        this.rootElement.classed("is-invalid", !this.isDataValid);

        if (this.isDataValid) {
// === BEGIN CHANGE: Update Caption DOM position calls ===
            moveLabelContainer(
                this.visualSettings.captionCard.position.value.value as "top" | "bottom", 
                this.captionContainer, 
                this.imageContainer
            );
            moveIndex(
                this.visualSettings.captionCard.indexPosition.value.value as "left" | "right",
                this.captionContainer,
                this.captionIndex,
                this.captionLabel
            );
            moveProgressIndicator(
                this.visualSettings.navigationCard.generalDotSettings.position.value.value as "top" | "bottom",
                this.rootElement,
                this.progressIndicator,
                this.contentContainer
            );
// === END CHANGE ===
            
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