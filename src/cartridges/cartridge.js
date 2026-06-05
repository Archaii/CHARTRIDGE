// cartridges/cartridge.js — the interface contract every cartridge follows.
//
// The router hot-swaps cartridges like real hardware: on switch it calls
// current.destroy() then next.mount(). Shared store state persists across
// the swap, so a region/genre the user picked carries into the next view.
//
// A cartridge factory has the shape:
//
//   createCartridge({ mountEl, data, store, shell }) => {
//     id, title,
//     mount(),          // build SVG/canvas, draw initial state, subscribe
//     update(state),    // respond to store changes via transitions
//     destroy(),        // unsubscribe, remove nodes, free the slot
//   }
//
//   mountEl  the cleared screen element to render into
//   data     the aggregates from buildAggregates() (shared, read-only)
//   store    the pub/sub store (region, focusedFamily, yearRange, …)
//   shell    console hooks: { setSampleSize(note) }
//
// This module is documentation-only; it exports nothing executable.
export {};
