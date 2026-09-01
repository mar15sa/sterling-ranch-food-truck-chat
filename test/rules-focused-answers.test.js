const test = require("node:test");
const assert = require("node:assert/strict");

const { focusedTopicAnswer } = require("../lib/rules-focused-answers");

const capture = (shortAnswer, findings, nextStep) => ({ shortAnswer, findings, nextStep });

test("focused answers defer public court operations while deriving rule-controlled flag and yard-art limits", () => {
  const court = focusedTopicAnswer(
    "Pickle ball",
    [
      { title: "Sec. 17-54. - General rules.", text: "Parks and Open Space are open from 6:00 a.m. to 10:00 p.m. daily." },
      { title: "Sec. 17-110. - Hours of operation.", text: "Hours are posted at each facility." },
    ],
    capture
  );
  assert.match(court.findings.join(" "), /CAB’s Pickleball Courts page/);
  assert.doesNotMatch(court.findings.join(" "), /6:00 a\.m\. to 10:00 p\.m\.|5:00 a\.m\./);

  const flag = focusedTopicAnswer(
    "How tall can a flagpole be?",
    [{ title: "CAB code amendments - flags and flagpoles", text: "No flag shall exceed three feet by five feet in size. DRC approval is required for freestanding flagpoles and separate nighttime illumination of a flag." }],
    capture
  );
  assert.match(flag.findings.join(" "), /three feet by five feet/);
  assert.doesNotMatch(flag.findings.join(" "), /four feet by six feet/);

  const yardArt = focusedTopicAnswer(
    "Yard art?",
    [{ title: "CAB code amendments - Outdoor Decorative Objects", text: "Outdoor Decorative Objects. Rear Yard: DRC approval is not required for yard or lawn ornamentation in the rear yard when ornamentation does not exceed four (4) feet in height. Front Yard: No more than four (4) ornaments; Items must be placed on the ground; Cannot exceed 18 inches in height or width; Must be integrated into the landscape design." }],
    capture
  );
  assert.match(yardArt.findings.join(" "), /four ornaments/);
  assert.match(yardArt.findings.join(" "), /18 inches/);
  assert.match(yardArt.findings.join(" "), /four feet/);
  assert.doesNotMatch(yardArt.findings.join(" "), /12 inches/);
});
