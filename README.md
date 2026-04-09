# Image Sequence Player – Usage Guide

## Summary
- [Image Sequence Player – Usage Guide](#image-sequence-player--usage-guide)
  - [Summary](#summary)
  - [Overview](#overview)
  - [Data Requirements](#data-requirements)
  - [How to Use](#how-to-use)
  - [Behavior](#behavior)
  - [Formatting Options](#formatting-options)
    - [Playback Settings](#playback-settings)
    - [Transition Settings](#transition-settings)
    - [Caption Settings](#caption-settings)
    - [Navigation Settings](#navigation-settings)
    - [General Settings](#general-settings)
  - [Typical Use Cases](#typical-use-cases)
  - [Notes](#notes)

---

## Overview

The Image Sequence Player is a Power BI custom visual that displays a sequence of images or data points. It provides playback controls to manually step through frames or automatically play them as a slideshow. It supports transitions, custom captions, navigation dots, and interactive cross-filtering with other report visuals.

## Data Requirements

The visual accepts four data fields in the field well:

* **Category**
  * **Expected type:** Text, Date, or Number
  * **Required:** Yes
  * **Description:** Defines the individual frames or steps in the sequence. Without this field, the visual will display a warning to add data.
* **Image**
  * **Expected type:** Image URL or Data URI (Base64/SVG)
  * **Required:** No
  * **Description:** The source URL for the image to display on each frame. If omitted, the visual displays a transparent placeholder.
* **Value**
  * **Expected type:** Numeric or Text
  * **Required:** No
  * **Description:** An associated metric for each category frame, which can be displayed in the caption.
* **Tooltips**
  * **Expected type:** Any Measure
  * **Required:** No
  * **Description:** Additional data points displayed when a user hovers over an image or navigation dot.

## How to Use

1. **Add the visual to the report:** Select the Image Sequence Player from the Visualizations pane.
2. **Assign fields:** Drag the primary sequence dimension into the **Category** field. Drag the corresponding image links into the **Image** field.
3. **Configure basic behavior:** Open the Format pane to adjust the playback speed, image fit, and choose whether captions and navigation dots should be displayed.
4. **Navigate:** Use the on-screen playback controls (Play, Pause, Step Forward, Step Backward, Go to Start, Go to End, Loop) to review the sequence.

## Behavior

* **Data Ordering:** The frames play sequentially based on the sorting applied to the Category field in Power BI.
* **Missing values:** If an image fails to load, a fallback error placeholder is displayed. If no image field is provided, the visual operates in a text-only mode using a transparent image.
* **Interactions:**
  * When a frame is selected or clicked, it can cross-filter other visuals on the report.
  * If other visuals cross-highlight the Image Sequence Player, frames not included in the highlight will appear dimmed.
  * Context menu (right-click) is supported.
* **Playback logic:** The player caches up to 10 images to maintain performance during playback. Playback can be set to loop continuously or stop at the final frame.

## Formatting Options

The visual can be customized using the Format pane:

### Playback Settings
* **Filter on Play:** (Toggle) When enabled, the visual automatically filters other report visuals as the frames advance during playback. 
* **Default Frame Duration (ms):** Sets the time each frame is displayed during automatic playback.

### Transition Settings
* **Enable Transitions:** (Toggle) Turns frame animations on or off.
* **Transition Type:** Choose between Fade, Slide Horizontally, or Slide Vertically.
* **Transition Duration (ms):** Sets the speed of the animation between frames.

### Caption Settings
* **Show Caption:** (Toggle) Enables or disables the text label.
* **Caption Position:** Top or Bottom.
* **Label Type:** Determines what data to show (Category, Value, Category: Value, Value (Category), or Nothing).
* **Index Type:** Controls the frame number formatting (n, n., #n, (n), n/N, or Nothing).
* **Index Position:** Left or Right of the main label.
* **Font styling:** Color, Font Family, Font Size, Bold, Italic, Underline.

### Navigation Settings
* **Show Navigation Dots:** (Toggle) Displays the frame indicator dots.
* **General > Position:** Top or Bottom.
* **General > Active Dot Color:** Sets the color for the currently selected dot.
* **Dot Numbers > Show Dot Numbers:** (Toggle) Displays the frame index number inside the dots.
* **Dot Numbers > Color:** Sets the text color of the dot numbers.

### General Settings
* **Image Alignment:** Controls how the image scales (Fit, Fill, Center).
* **Background Color:** Adjusts the background behind the image.

## Typical Use Cases

* Viewing time-lapse photography or satellite imagery linked to a date field.
* Stepping through process documentation, user guides, or assembly instructions.
* Automatically rotating through top-performing products or staff members on a digital signage dashboard.

## Notes

* **Free Tier Limit:** The free version of the visual limits rendering to a maximum of 15 categories (frames). Users exceeding this limit will see a warning message and only the first 15 frames will be displayed. A Pro license expands this capacity.
* **URL Restrictions:** The visual renders both standard `HTTP` and secure `HTTPS` external image URLs, as well as self-contained base64 Data URIs.
* **Caching:** Only the most recently used 10 images are stored in the memory cache at any time to prevent performance degradation.