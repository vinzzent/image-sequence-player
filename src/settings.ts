"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

// --- Import the correct SimpleCard component ---
import FormattingSettingsSimpleCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

// --- Define dropdown options ---
const transitionTypeOptions: powerbi.IEnumMember[] = [    
    { value: "fade", displayName: "Fade" },
    { value: "slideHorizontal", displayName: "Slide Horizontally" },
    { value: "slideVertical", displayName: "Slide Vertically" }
];

const positionOptions: powerbi.IEnumMember[] = [
    { value: "top", displayName: "Top" },
    { value: "bottom", displayName: "Bottom" }
];

const imageAlignmentOptions: powerbi.IEnumMember[] = [
    { value: "contain", displayName: "Fit" },
    { value: "cover", displayName: "Fill" },
    { value: "scale-down", displayName: "Center" }
];

const captionTypeOptions: powerbi.IEnumMember[] = [
    { value: "category", displayName: "Category" },
    { value: "value", displayName: "Value" },
    { value: "category_value", displayName: "Category: Value" }
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

    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Enable Transitions",
        value: true
    });

    transitionType = new formattingSettings.ItemDropdown({
        name: "transitionType",
        displayName: "Transition Type",
        items: transitionTypeOptions,
        value: transitionTypeOptions[0] // Default to Fade
    });

    transitionDuration = new formattingSettings.NumUpDown({
        name: "transitionDuration",
        displayName: "Transition Duration (ms)",
        value: 300
    });

    topLevelSlice: formattingSettings.ToggleSwitch = this.show;
    slices: FormattingSettingsSlice[] = [this.transitionType, this.transitionDuration];
}

class CaptionSettingsCard extends FormattingSettingsSimpleCard {
    name: string = "caption";
    displayName: string = "Caption Settings";

    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Labels",
        value: false
    });

    position = new formattingSettings.ItemDropdown({
        name: "position",
        displayName: "Position",
        items: positionOptions,
        value: positionOptions[0] // Default to Top
    });

    type = new formattingSettings.ItemDropdown({
        name: "type",
        displayName: "Type",
        items: captionTypeOptions,
        value: captionTypeOptions[0] // Default to Category
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
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

    topLevelSlice: formattingSettings.ToggleSwitch = this.show;
    slices: FormattingSettingsSlice[] = [this.position, this.color, this.font];
}

class NavigationSettingsCard extends FormattingSettingsSimpleCard {
    name: string = "navigation";
    displayName: string = "Navigation Settings";

    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Navigation Dots",
        description: "Show or hide the navigation dots.",
        value: true
    });

    position = new formattingSettings.ItemDropdown({
        name: "position",
        displayName: "Position",
        items: positionOptions,
        value: positionOptions[1] // Default to Top
    });

    activeDotColor = new formattingSettings.ColorPicker({
        name: "activeDotColor",
        displayName: "Color",
        value: { value: "#118DFF" }
    });

    topLevelSlice: formattingSettings.ToggleSwitch = this.show;
    slices: FormattingSettingsSlice[] = [this.position, this.activeDotColor];
}

class GeneralSettingsCard extends FormattingSettingsSimpleCard {
    name: string = "general";
    displayName: string = "General Settings";

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

    slices: FormattingSettingsSlice[] = [this.imageAlignment, this.backgroundColor];
}

/**
 * Main visual formatting settings model class
 */
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    playbackCard = new PlaybackSettingsCard();
    transitionCard = new TransitionSettingsCard();
    captionCard = new CaptionSettingsCard();
    navigationCard = new NavigationSettingsCard();
    generalCard = new GeneralSettingsCard();

    cards = [
        this.playbackCard,
        this.transitionCard,
        this.captionCard,
        this.navigationCard,
        this.generalCard
    ];
}
