"use strict";

// #region IMPORTS & INTERFACES

import { select as d3Select, Selection } from "d3-selection";
import { timeout, Timer } from "d3-timer";

interface IconData {
    viewBox: string;
    path: string;
}

// #endregion

// ===================================================================
// #region CLASS: PLAYER UI CONTROLLER
// ===================================================================

/**
 * Manages playback UI controls: play, pause, step, loop, and navigation.
 * Updates button icons and handles a simple playback timer.
 * Communicates user actions to the orchestrating Renderer via callbacks.
 */
export class PlayerUIController {
    private _isLooping = false;
    private playPauseButton: Selection<HTMLButtonElement, any, any, any>;
    private playbackTimer?: Timer;

    constructor(
        private controlsWrapper: Selection<HTMLDivElement, any, any, any>,
        private onNavigate: (index: number) => Promise<void>,
        private onStep: (direction: number) => Promise<void>,
        private onTogglePlayback: () => void
    ) {
        this.setupControls();
    }

    get isLooping() {
        return this._isLooping;
    }

    /**
     * Updates the play/pause button icon when instructed by the Renderer.
     * @param {boolean} isPlaying - True to show the 'pause' icon, false for the 'play' icon.
     */
    public updatePlayPauseIcon(isPlaying: boolean): void {
        const icon = isPlaying ? PlayerUIController.ICONS.pause : PlayerUIController.ICONS.play;
        this.updateButtonIcon(this.playPauseButton, icon);
    }

    /**
     * Starts or stops the playback timer.
     * @param {boolean} shouldPlay - True to start the timer, false to stop.
     * @param {() => void} [callback] - The function to execute when the timer elapses. Required only if shouldPlay is true.
     * @param {number} [delayMs] - The delay in milliseconds. Required only if shouldPlay is true.
     */
    public setTimer(shouldPlay: boolean, callback?: () => void, delayMs?: number): void {
        if (this.playbackTimer) this.playbackTimer.stop();

        if (shouldPlay && callback && typeof delayMs !== 'undefined') {
            this.playbackTimer = timeout(callback, delayMs);
        }
    }

    private setupControls(): void {
        this.createIconButton(this.controlsWrapper, PlayerUIController.ICONS.upArrow)
            .classed("panel-indicator", true)
            .on("click", () => {
                const isExpanded = this.controlsWrapper.classed("is-expanded");
                this.controlsWrapper.classed("is-expanded", !isExpanded);
            });

        const controlsPanel = this.controlsWrapper.append("div").classed("controls-panel", true);
        const controlButtons = controlsPanel.append("div").classed("control-buttons", true);

        this.createIconButton(controlButtons, PlayerUIController.ICONS.goToStart).on("click", () => this.onNavigate(0));
        this.createIconButton(controlButtons, PlayerUIController.ICONS.stepBack).on("click", () => this.onStep(-1));
        this.playPauseButton = this.createIconButton(controlButtons, PlayerUIController.ICONS.play).on("click", () => this.onTogglePlayback());
        this.createIconButton(controlButtons, PlayerUIController.ICONS.stepForward).on("click", () => this.onStep(1));
        this.createIconButton(controlButtons, PlayerUIController.ICONS.goToEnd).on("click", () => this.onNavigate(-1)); // -1 is a sentinel for last frame
        this.createIconButton(controlButtons, PlayerUIController.ICONS.loop)
            .classed("loop-toggle", true)
            .on("click", (event) => {
                this._isLooping = !this._isLooping;
                d3Select(event.currentTarget).classed("active", this._isLooping);
            });
    }

    private createIconButton(container: Selection<any, any, any, any>, iconData: IconData): Selection<HTMLButtonElement, any, any, any> {
        const button = container.append("button");
        const svg = button.append("svg").attr("viewBox", iconData.viewBox);
        svg.append("path").attr("d", iconData.path);
        return button;
    }

    private updateButtonIcon(button: Selection<HTMLButtonElement, any, any, any>, iconData: IconData): void {
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

// #endregion