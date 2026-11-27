import { installFocusAnchor } from "./shared/focus-anchor";
import { localizeCardPickerDescriptions } from "./shared/card-picker";

// Before the card registers: closing a more-info dialog should not throw the
// dashboard back to whatever was focused last. See shared/focus-anchor.ts.
installFocusAnchor();

export * from "./m3-weather-card-week";

localizeCardPickerDescriptions();
