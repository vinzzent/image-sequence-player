"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

// --- Import the correct SimpleCard component ---
import FormattingSettingsSimpleCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

// --- Define dropdown options ---
const transitionTypeOptions: powerbi.IEnumMember[] = [
    { value: "none", displayName: "None" },
    { value: "fade", displayName: "Fade" },
    { value: "slideHorizontal", displayName: "Slide Horizontally" },
    { value: "slideVertical", displayName: "Slide Vertically" }
];

const labelPositionOptions: powerbi.IEnumMember[] = [
    { value: "below", displayName: "Below" },
    { value: "above", displayName: "Above" }
];

const imageAlignmentOptions: powerbi.IEnumMember[] = [
    { value: "contain", displayName: "Fit" },
    { value: "cover", displayName: "Fill" },
    { value: "scale-down", displayName: "Center" }
];

// --- Define Formatting Cards ---

class PlaybackSettingsCard extends FormattingSettingsSimpleCard {
    name: string = "playback";
    displayName: string = "Playback Settings";

    selectionSequence = new formattingSettings.ToggleSwitch({
        name: "selectionSequence",
        displayName: "Selection Sequence",
        description: "Enable to apply a filter for each frame during playback.",
        value: false
    });

    defaultFrameDuration = new formattingSettings.NumUpDown({
        name: "defaultFrameDuration",
        displayName: "Default Frame Duration (ms)",
        description: "The time each frame is displayed during playback.",
        value: 1000
    });

    slices: FormattingSettingsSlice[] = [this.selectionSequence, this.defaultFrameDuration];
}

class TransitionSettingsCard extends FormattingSettingsSimpleCard {
    name: string = "transition";
    displayName: string = "Transition Settings";

    transitionType = new formattingSettings.ItemDropdown({
        name: "transitionType",
        displayName: "Transition Type",
        items: transitionTypeOptions,
        value: transitionTypeOptions[1] // Default to Fade
    });

    transitionDuration = new formattingSettings.NumUpDown({
        name: "transitionDuration",
        displayName: "Transition Duration (ms)",
        value: 300
    });

    slices: FormattingSettingsSlice[] = [this.transitionType, this.transitionDuration];
}

class LabelSettingsCard extends FormattingSettingsSimpleCard {
    name: string = "labels";
    displayName: string = "Label Settings";

    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Labels",
        value: true
    });

    labelColor = new formattingSettings.ColorPicker({
        name: "labelColor",
        displayName: "Color",
        value: { value: "#333333" }
    });

    font = new formattingSettings.FontControl({
        name: "font",
        displayName: "Font",
        fontFamily: new formattingSettings.FontPicker({ name: "fontFamily", value: "Segoe UI" }),
        fontSize: new formattingSettings.NumUpDown({ name: "fontSize", value: 12 }),
        bold: new formattingSettings.ToggleSwitch({ name: "bold", value: false }),
        italic: new formattingSettings.ToggleSwitch({ name: "italic", value: false })
    });

    position = new formattingSettings.ItemDropdown({
        name: "position",
        displayName: "Position",
        items: labelPositionOptions,
        value: labelPositionOptions[0] // Default to Below
    });

    slices: FormattingSettingsSlice[] = [this.show, this.labelColor, this.font, this.position];
}

class GeneralSettingsCard extends FormattingSettingsSimpleCard {
    name: string = "general";
    displayName: string = "General Settings";

    showProgressIndicator = new formattingSettings.ToggleSwitch({
        name: "showProgressIndicator",
        displayName: "Show Navigation Dots",
        description: "Show or hide the navigation dots below the image.",
        value: true
    });

    imageAlignment = new formattingSettings.ItemDropdown({
        name: "imageAlignment",
        displayName: "Image Alignment",
        items: imageAlignmentOptions,
        value: imageAlignmentOptions[0] // Default to Fit
    });

    backgroundColor = new formattingSettings.ColorPicker({
        name: "backgroundColor",
        displayName: "Background Color",
        value: { value: "#FFFFFF" }
    });

    slices: FormattingSettingsSlice[] = [this.showProgressIndicator, this.imageAlignment, this.backgroundColor];
}

/**
 * Main visual formatting settings model class
 */
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    playbackCard = new PlaybackSettingsCard();
    transitionCard = new TransitionSettingsCard();
    labelCard = new LabelSettingsCard();
    generalCard = new GeneralSettingsCard();

    cards = [
        this.playbackCard,
        this.transitionCard,
        this.labelCard,
        this.generalCard
    ];
}