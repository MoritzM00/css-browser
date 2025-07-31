// Main entry point for the browser demo.
// Allows recording motion data and classifying activities.

/* 
TODO: request permission on iphone (https://stackoverflow.com/a/58685549)
TODO: add more sensor using SensorAPI https://developer.mozilla.org/en-US/docs/Web/API/Sensor_APIs
TODO: add audio or video features?
*/
// Core library used for data collection and machine learning predictions
import edgeML from "@triedel/edge-ml";
// Helper to detect the current browser/mobile device
import MobileDetect from "mobile-detect";
// SystemJS is used to load the model code at runtime
import System from "systemjs";

/* evalutate property path separated by "." */
// Resolve a set of dot separated selectors on an object and yield the values
function* getValuesBySelectors(obj, selectors) {
  // Iterate over each selector string
  for (const selector of selectors) {
    // Split selector into nested property names
    const properties = selector.split(".");
    let value = obj;

    // Walk down the property path
    for (const property of properties) {
      if (typeof value === "object" && property in value) {
        // Step deeper in the object hierarchy
        value = value[property];
      } else {
        // Property does not exist -> mark as missing
        value = null;
        break;
      }
    }

    // Yield the selector together with the resolved value
    yield [selector, value];
  }
}
// Generate a random participant id on load

document.getElementById("subject").value = Math.floor(
  (1 + Math.random()) * 0x10000
).toString(16);

// Tags that will be sent with every dataset record
var defaultTags = {};

var timer; // Interval used during classification

// Detect browser and platform information
const mobile = new MobileDetect(window.navigator.userAgent);

if (mobile.mobile()) {
  defaultTags.mobile = mobile.mobile();
}

if (mobile.userAgent()) {
  defaultTags.browser = mobile.userAgent();
}
// Load the pre-trained model script from the server

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

      /**
       * Start recording sensor data and upload it using edge-ml.
       */
      async function start_recording() {
        for (var [sensor, fun] of Object.entries(sensors)) {
          fun.collector = await edgeML.datasetCollector(
            "https://edge-ml-beta.dmz.teco.edu", // Backend-URL
            "5fe6e50c3fb5001531bbd8e03a8c591f", // API-Key
            sensor, // Name for the dataset
            false, // False to provide own timestamps
            fun.keys, // Name of the time-series to create in the dataset
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

      /**
       * Start live classification using the loaded model.
       */
      async function start_classifying() {
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

      /**
       * Stop recording and finalize dataset uploads.
       */
      async function stop_recording() {
        for (const [sensor, fun] of Object.entries(sensors)) {
          window.removeEventListener(sensor, fun.record, true);
          await fun.collector.onComplete();
        }
      }

      /**
       * Stop the classifier and remove all listeners.
       */
      async function stop_classifying() {
        for (const [sensor, fun] of Object.entries(sensors)) {
          if ("score" in fun) {
            window.removeEventListener(sensor, fun.score, true);
          }
        }
      }

      /**
       * Add a data point to the recording collector.
       * The timestamp is provided by the event.
       */
      function record(eventtype, fields, eventtime) {
        // time at which the event happened
        for (const [key, value] of Object.entries(fields)) {
          if (value !== null) {
            sensors[eventtype].collector.addDataPoint(
              Math.floor(eventtime),
              key,
              value
            );
          }
        }
      }

      /**
       * Add a data point to the classifier.
       * The timestamp is provided by the event.
       */
      function score(eventtype, fields, eventtime) {
        // time at which the event happened
        for (const [key, value] of Object.entries(fields)) {
          if (value !== null) {
            sensors[eventtype].classifier.addDataPoint(
              Math.floor(eventtime),
              key,
              value
            );
          }
        }
      }



// Toggle recording when the checkbox is changed

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
// Toggle live classification using the checkbox

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
