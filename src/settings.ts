"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

// --- Import the correct SimpleCard component ---
import FormattingSettingsSimpleCard = formattingSettings.SimpleCard;
import FormattingSettingsCompositeCard = formattingSettings.CompositeCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsGroup = formattingSettings.Group;
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

// === BEGIN CHANGE: Caption Settings Options ===
const captionTypeOptions: powerbi.IEnumMember[] = [
    { value: "category", displayName: "Category" },
    { value: "value", displayName: "Value" },
    { value: "category_value", displayName: "Category: Value" },
    { value: "value_category", displayName: "Value (Category)" },
    { value: "nothing", displayName: "Nothing" }
];

const indexTypeOptions: powerbi.IEnumMember[] = [
    { value: "n", displayName: "n" },
    { value: "n_dot", displayName: "n." },
    { value: "hash_n", displayName: "#n" },
    { value: "parenthesis_n", displayName: "(n)" },
    { value: "n_of_N", displayName: "n/N" },
    { value: "nothing", displayName: "Nothing" }
];

const indexPositionOptions: powerbi.IEnumMember[] = [
    { value: "left", displayName: "Left" },
    { value: "right", displayName: "Right" }
];
// === END CHANGE ===

// --- Define Formatting Cards ---

class PlaybackSettingsCard extends FormattingSettingsSimpleCard {
    name: string = "playback";
    displayName: string = "Playback Settings";

    selectionSequence = new formattingSettings.ToggleSwitch({
        name: "selectionSequence",
        displayName: "Filter on Play",
        description: "Filters other visuals automatically during playback.",
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

// === BEGIN CHANGE: CaptionSettingsCard Updates ===
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
        displayName: "Caption Position",
        items: positionOptions,
        value: positionOptions[0] // Default to Top
    });

    type = new formattingSettings.ItemDropdown({
        name: "type",
        displayName: "Label Type",
        items: captionTypeOptions,
        value: captionTypeOptions[0] // Default to Category
    });

    indexType = new formattingSettings.ItemDropdown({
        name: "indexType",
        displayName: "Index Type",
        items: indexTypeOptions,
        value: indexTypeOptions[0] // Default to n
    });

    indexPosition = new formattingSettings.ItemDropdown({
        name: "indexPosition",
        displayName: "Index Position",
        items: indexPositionOptions,
        value: indexPositionOptions[0] // Default to left
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Color",
        value: { value: "#333333" }
    });

    fontFamily = new formattingSettings.FontPicker({ name: "fontFamily", value: "Segoe UI" });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", value: 12 });
    bold = new formattingSettings.ToggleSwitch({ name: "bold", value: false });
    italic = new formattingSettings.ToggleSwitch({ name: "italic", value: false });
    underline = new formattingSettings.ToggleSwitch({ name: "underline", value: false });

    font = new formattingSettings.FontControl({
        name: "font",
        displayName: "Font",
        fontFamily: this.fontFamily,
        fontSize: this.fontSize,
        bold: this.bold,
        italic: this.italic,
        underline: this.underline
    });

    topLevelSlice: formattingSettings.ToggleSwitch = this.show;
    slices: FormattingSettingsSlice[] = [this.position, this.type, this.indexType, this.indexPosition, this.color, this.font];
}
// === END CHANGE ===

class DotNumbersGroup extends FormattingSettingsSimpleCard {
    name: string = "dotNumbers";
    displayName: string = "Dot Numbers";

    showDotNumbers = new formattingSettings.ToggleSwitch({
        name: "showDotNumbers",
        displayName: "Show Dot Numbers",
        description: "Show or hide the dot numbers.",
        value: true
    });

    dotNumbersColor = new formattingSettings.ColorPicker({
        name: "dotNumbersColor",
        displayName: "Color",
        value: { value: "" }
    });

    topLevelSlice: formattingSettings.ToggleSwitch = this.showDotNumbers;
    slices: FormattingSettingsSlice[] = [this.dotNumbersColor];
}

class GeneralDotSettingsGroup extends FormattingSettingsSimpleCard {
    name: string = "generalDotSettings";
    displayName: string = "General";

    position = new formattingSettings.ItemDropdown({
        name: "position",
        displayName: "Position",
        items: positionOptions,
        value: positionOptions[1] // Default to Top
    });

    activeDotColor = new formattingSettings.ColorPicker({
        name: "activeDotColor",
        displayName: "Color",
        value: { value: "" }
    });

    slices: FormattingSettingsSlice[] = [this.position, this.activeDotColor];
}

class NavigationSettingsCard extends FormattingSettingsCompositeCard {
    name: string = "navigation";
    displayName: string = "Navigation Settings";

    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Navigation Dots",
        description: "Show or hide the navigation dots.",
        value: true
    });

    generalDotSettings = new GeneralDotSettingsGroup();
    dotNumbers = new DotNumbersGroup();
    topLevelSlice: formattingSettings.ToggleSwitch = this.show;
    groups: FormattingSettingsGroup[] = [this.generalDotSettings, this.dotNumbers];
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
        value: { value: "" }
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