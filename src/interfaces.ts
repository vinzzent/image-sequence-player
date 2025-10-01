"use strict";

import powerbi from "powerbi-visuals-api";
import ISelectionId = powerbi.visuals.ISelectionId;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

export interface ImageFrame {
    identity: ISelectionId;
    imageUri: string;
    caption: string;
    tooltips: VisualTooltipDataItem[];
    dimmed: boolean;
    errorImgParams: ErrorImgParams;

}

export interface ErrorImgParams {
    fillLineColor: string;
    strokeLineColor: string;
    fillImgColor: string;
    strokeImgColor: string;
    strokeWidth: number;
    opacity: number;
}