'use strict';
// Tabs of bots ("spaces"). Off by default. When on, every tab is its own wall: bots in one tab never see,
// message, group with or @mention bots of another tab, and each tab has its own files folder.
// A bot's tab is its `space` (a short id); no `space` means the Main tab. With tabs off, everything is Main.
let enabled = false;
const setEnabled = (v) => { enabled = v === true; };
const isOn = () => enabled;
const spaceOf = (p) => (enabled && p && typeof p.space === 'string' && /^[a-z0-9]{1,12}$/.test(p.space) ? p.space : 'main');
// The extra files folder of a tab, next to the shared one ('two' is the old second space of 1.3.53).
const folderSuffix = (id) => (id === 'two' ? ' (Space 2)' : ` (Space ${id})`);
module.exports = { setEnabled, isOn, spaceOf, folderSuffix };
