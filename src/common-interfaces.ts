"use strict";

import powerbi from "powerbi-visuals-api";
import ISelectionId = powerbi.visuals.ISelectionId;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

export interface ImageFrame {
    identity: ISelectionId | null;
    imageUri: string | null;
    caption: string;
    indexText: string;
    tooltips: VisualTooltipDataItem[] | undefined;
    dimmed: boolean;
}

export interface TransformResult {
    frames: ImageFrame[];
    targetHighlightIndex: number;
}