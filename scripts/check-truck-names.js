const assert = require("node:assert/strict");
const { splitListedTruckNames } = require("../lib/truck-names");

const knownTrucks = new Set([
  "kona ice",
  "tacotento mas",
  "uptown humboldt",
]);
const options = {
  hasKnownTruckData(name) {
    return knownTrucks.has(name.toLowerCase().replace(/\s*&\s*/g, " "));
  },
  singleTruckNamesWithJoiners: ["Uptown & Humboldt"],
};

assert.deepEqual(splitListedTruckNames("Uptown & Humboldt & Kona Ice", options), [
  "Uptown & Humboldt",
  "Kona Ice",
]);
assert.deepEqual(splitListedTruckNames("Tacotento & Mas", options), ["Tacotento & Mas"]);
assert.deepEqual(splitListedTruckNames("Truck One & Truck Two", options), [
  "Truck One",
  "Truck Two",
]);

console.log("Truck name parsing fixtures passed.");
