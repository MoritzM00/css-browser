/* 
TODO: request permission on iphone (https://stackoverflow.com/a/58685549)
TODO: add more sensor using SensorAPI https://developer.mozilla.org/en-US/docs/Web/API/Sensor_APIs
TODO: add audio or video features?
*/
import edgeML from "@triedel/edge-ml";
import MobileDetect from "mobile-detect";
import System from "systemjs";

/* evalutate property path separated by "." */
function* getValuesBySelectors(obj, selectors) {
  for (const selector of selectors) {
    const properties = selector.split(".");
    let value = obj;

    for (const property of properties) {
      if (typeof value === "object" && property in value) {
        value = value[property];
      } else {
        // Property not found, yield null
        value = null;
        break;
      }
    }

    yield [selector, value];
  }
}

/* replace characters not allowed in timeseries names */
function sanitizeKey(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

document.getElementById("subject").value = Math.floor(
  (1 + Math.random()) * 0x10000
).toString(16);

var defaultTags = {};

var timer;

const mobile = new MobileDetect(window.navigator.userAgent);

if (mobile.mobile()) {
  defaultTags.mobile = mobile.mobile();
}

if (mobile.userAgent()) {
  defaultTags.browser = mobile.userAgent();
}

fetch(
  "https://gitlab.kit.edu/api/v4/projects/173274/repository/files/data_snapshot%2Fdeviceorientation_model.mjs/raw?ref=master"
)
  .then((res) => res.text())
  .then((code) => {
    const script = document.createElement("script");
    script.textContent = code + "; window.onMyScriptLoaded()";

    window.onMyScriptLoaded = () => {
      var sensors = {
        deviceorientation: {
          keys: ["alpha", "beta", "gamma"],
          record: function (/** @type {DeviceOrientationEvent} */ evt) {
            record(
              evt.type,
              Object.fromEntries(
                getValuesBySelectors(evt, sensors[evt.type].keys)
              ),
              evt.timeStamp + performance.timeOrigin
            );
          },
          //    model: require("./deviceorientation_model.mjs"),
          model: window.deviceorientation_model,
          score: function (/** @type {DeviceOrientationEvent} */ evt) {
            score(
              evt.type,
              Object.fromEntries(
                getValuesBySelectors(evt, sensors[evt.type].keys)
              ),
              evt.timeStamp + performance.timeOrigin
            );
          },
        },
        devicemotion: {
          keys: [
            "acceleration.x",
            "acceleration.y",
            "acceleration.z",
            "accelerationIncludingGravity.x",
            "accelerationIncludingGravity.y",
            "accelerationIncludingGravity.z",
            "rotationRate.alpha",
            "rotationRate.beta",
            "rotationRate.gamma",
          ],
          record: function (/** @type {DeviceMotionEvent} */ evt) {
            record(
              evt.type,
              Object.fromEntries(
                getValuesBySelectors(evt, sensors[evt.type].keys)
              ),
              evt.timeStamp + performance.timeOrigin
            );
          },
        },
      };

      // create sanitized key lists and maps for each sensor
      for (const sensor of Object.values(sensors)) {
        sensor.sanitizedKeys = sensor.keys.map((k) => sanitizeKey(k));
        sensor.keyMap = Object.fromEntries(
          sensor.keys.map((k) => [k, sanitizeKey(k)])
        );
      }

      async function start_recording() {
        for (var [sensor, fun] of Object.entries(sensors)) {
          fun.collector = await edgeML.datasetCollector(
            "https://edge-ml-beta.dmz.teco.edu", // Backend-URL
            "5fe6e50c3fb5001531bbd8e03a8c591f", // API-Key
            sensor, // Name for the dataset
            false, // False to provide own timestamps
            fun.sanitizedKeys, // Name of the time-series to create in the dataset
            Object.assign(
              {
                participantId: document.getElementById("subject").value,
                activity: document.getElementById("label").value,
              },
              defaultTags
            ),
            "activity_" + document.getElementById("label").value
          );

          window.addEventListener(sensor, fun.record, true);
        }
      }

      async function start_classifying() {
        for (var [sensor, f] of Object.entries(sensors)) {
          const fun = f;
          if ("score" in fun) {
            fun.classifier = await new edgeML.Predictor(
              fun.model.score,
              fun.model.inputs,
              fun.model.window,
              fun.model.classes,
              fun.model.scale
            );

            window.addEventListener(sensor, fun.score, true);

            timer = window.setInterval(function () {
              const curfun = fun;
              curfun.classifier
                .predict()
                .catch((error) => {
                  console.log(error);
                })
                .then((output) => {
                  document.getElementById("debug").innerHTML = JSON.stringify(
                    output,
                    null,
                    2
                  );
                });
            }, 1000);
          }
        }
      }

      async function stop_recording() {
        for (const [sensor, fun] of Object.entries(sensors)) {
          window.removeEventListener(sensor, fun.record, true);
          await fun.collector.onComplete();
        }
      }

      async function stop_classifying() {
        for (const [sensor, fun] of Object.entries(sensors)) {
          if ("score" in fun) {
            window.removeEventListener(sensor, fun.score, true);
          }
        }
      }

      function record(eventtype, fields, eventtime) {
        // time at which the event happend
        for (const [key, value] of Object.entries(fields)) {
          if (value !== null) {
            sensors[eventtype].collector.addDataPoint(
              Math.floor(eventtime),
              sensors[eventtype].keyMap[key] || key,
              value
            );
          }
        }
      }

      function score(eventtype, fields, eventtime) {
        // time at which the event happend
        for (const [key, value] of Object.entries(fields)) {
          if (value !== null) {
            sensors[eventtype].classifier.addDataPoint(
              Math.floor(eventtime),
              sensors[eventtype].keyMap[key] || key,
              value
            );
          }
        }
      }

      // Wir schalten einen Timer an/aus mit der checkbox
      document.getElementById("record").onchange = function () {
        if (this.checked) {
          start_recording();
          document.getElementById("debug").innerHTML = "Recording.";
        } else {
          stop_recording();
          document.getElementById("debug").innerHTML = "Not recording.";
        }
      };

      // Wir schalten einen Timer an/aus mit der checkbox
      document.getElementById("classify").onchange = function () {
        if (this.checked) {
          start_classifying();
          document.getElementById("debug").innerHTML = "Recording.";
        } else {
          stop_classifying();
          document.getElementById("debug").innerHTML = "Not recording.";
        }
      };
      document.getElementById("debug").innerHTML = "Initialized.";
    };

    document.body.appendChild(script);
  });
