function _defineProperty(obj, key, value) {
	if (key in obj) {
		Object.defineProperty(obj, key, {
			value,
			enumerable: true,
			configurable: true,
			writable: true
		});
	} else {
		obj[key] = value;
	}
	return obj;
}
var FEATURE_FLAG_NAMES = Object.freeze({
	// This flag exists as a workaround for issue 454 (basically a browser bug) - seems like these rect values take time to update when in grid layout. Setting it to true can cause strange behaviour in the REPL for non-grid zones, see issue 470
	USE_COMPUTED_STYLE_INSTEAD_OF_BOUNDING_RECT: 'USE_COMPUTED_STYLE_INSTEAD_OF_BOUNDING_RECT'
});
_defineProperty({}, FEATURE_FLAG_NAMES.USE_COMPUTED_STYLE_INSTEAD_OF_BOUNDING_RECT, false);
var _ID_TO_INSTRUCTION;
var INSTRUCTION_IDs$1 = {
	DND_ZONE_ACTIVE: 'dnd-zone-active',
	DND_ZONE_DRAG_DISABLED: 'dnd-zone-drag-disabled'
};
((_ID_TO_INSTRUCTION = {}),
	_defineProperty(_ID_TO_INSTRUCTION, INSTRUCTION_IDs$1.DND_ZONE_ACTIVE, 'Tab to one the items and press space-bar or enter to start dragging it'),
	_defineProperty(_ID_TO_INSTRUCTION, INSTRUCTION_IDs$1.DND_ZONE_DRAG_DISABLED, 'This is a disabled drag and drop list'),
	_ID_TO_INSTRUCTION);
//# sourceMappingURL=index7.js.map
