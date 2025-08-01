/* 
 * TODO LIST:
 * - Request permission on iPhone (https://stackoverflow.com/a/58685549)
 * - Add more sensors using SensorAPI https://developer.mozilla.org/en-US/docs/Web/API/Sensor_APIs
 * - Add audio or video features for extended data collection
 */

// Import the EdgeML library for machine learning data collection and prediction
import edgeML from "@triedel/edge-ml";
// Import MobileDetect library to detect mobile devices and browser information
import MobileDetect from "mobile-detect";
// Import SystemJS for dynamic module loading (currently unused in the code)

/**
 * Generator function that extracts values from an object using dot-notation selectors
 * @param {Object} obj - The object to extract values from
 * @param {Array<string>} selectors - Array of dot-notation property paths (e.g., "acceleration.x")
 * @yields {Array} - Yields [selector, value] pairs for each selector
 */
function* getValuesBySelectors(obj, selectors) {
  // Iterate through each selector string (e.g., "acceleration.x", "rotationRate.alpha")
  for (const selector of selectors) {
    // Split the selector by dots to get individual property names
    const properties = selector.split(".");
    // Start with the root object
    let value = obj;

    // Navigate through the nested object properties
    for (const property of properties) {
      // Check if current value is an object and has the required property
      if (typeof value === "object" && property in value) {
        // Move deeper into the object hierarchy
        value = value[property];
      } else {
        // Property not found in the chain, set value to null
        value = null;
        break; // Exit the property navigation loop
      }
    }

    // Yield a key-value pair: [selector string, extracted value or null]
    yield [selector, value];
  }
}

// Generate a random hexadecimal subject ID and set it as the default value for the subject input field
// Math.random() generates 0-1, multiply by 0x10000 (65536), add 1 to get 1-65537 range
// Math.floor() removes decimals, toString(16) converts to hexadecimal string
document.getElementById("subject").value = Math.floor(
  (1 + Math.random()) * 0x10000
).toString(16);

// Object to store default metadata tags that will be attached to all data collections
var defaultTags = {};

// Variable to store the timer ID for the classification prediction interval
var timer;

// Create a new MobileDetect instance to analyze the user agent string and detect device type
const mobile = new MobileDetect(window.navigator.userAgent);

// Check if the device is detected as mobile and add it to default tags
if (mobile.mobile()) {
  // Store the mobile device type (e.g., "iPhone", "Android") in default tags
  defaultTags.mobile = mobile.mobile();
}

// Check if browser information is available and add it to default tags
if (mobile.userAgent()) {
  // Store the browser type (e.g., "Chrome", "Safari") in default tags
  defaultTags.browser = mobile.userAgent();
}

// Fetch the device orientation machine learning model from GitLab repository
// This model will be used for real-time activity classification
fetch(
  "https://gitlab.kit.edu/api/v4/projects/173274/repository/files/data_snapshot%2Fdeviceorientation_model.mjs/raw?ref=master"
)
  // Convert the response to text (JavaScript code)
  .then((res) => res.text())
  // Process the fetched JavaScript code
  .then((code) => {
    // Create a new script element to execute the fetched model code
    const script = document.createElement("script");
    // Set the script content to the fetched code plus a callback function call
    script.textContent = code + "; window.onMyScriptLoaded()";

    // Define the callback function that will be executed after the model loads
    window.onMyScriptLoaded = () => {
      // Configuration object for different sensor types and their data processing
      var sensors = {
        // Device orientation sensor (compass, tilt)
        deviceorientation: {
          // Keys represent the data fields to extract from device orientation events
          keys: ["alpha", "beta", "gamma"], // Alpha: rotation around z-axis, Beta: front-back tilt, Gamma: left-right tilt
          
          // Function to record device orientation data for training/data collection
          record: function (/** @type {DeviceOrientationEvent} */ evt) {
            // Call the generic record function with processed event data
            record(
              evt.type, // Event type ("deviceorientation")
              // Convert the extracted key-value pairs to an object
              Object.fromEntries(
                getValuesBySelectors(evt, sensors[evt.type].keys)
              ),
              // Calculate absolute timestamp by adding event timestamp to performance time origin
              evt.timeStamp + performance.timeOrigin
            );
          },
          
          // Reference to the loaded machine learning model (set by the fetched script)
          model: window.deviceorientation_model,
          
          // Function to score/classify device orientation data in real-time
          score: function (/** @type {DeviceOrientationEvent} */ evt) {
            // Call the generic score function with processed event data
            score(
              evt.type, // Event type ("deviceorientation")
              // Convert the extracted key-value pairs to an object
              Object.fromEntries(
                getValuesBySelectors(evt, sensors[evt.type].keys)
              ),
              // Calculate absolute timestamp by adding event timestamp to performance time origin
              evt.timeStamp + performance.timeOrigin
            );
          },
        },
        // Device motion sensor (accelerometer, gyroscope)
        devicemotion: {
          // Keys represent the data fields to extract from device motion events
          keys: [
            "acceleration.x",                    // Linear acceleration excluding gravity (X-axis)
            "acceleration.y",                    // Linear acceleration excluding gravity (Y-axis)
            "acceleration.z",                    // Linear acceleration excluding gravity (Z-axis)
            "accelerationIncludingGravity.x",    // Total acceleration including gravity (X-axis)
            "accelerationIncludingGravity.y",    // Total acceleration including gravity (Y-axis)
            "accelerationIncludingGravity.z",    // Total acceleration including gravity (Z-axis)
            "rotationRate.alpha",                // Rotation rate around Z-axis (degrees/second)
            "rotationRate.beta",                 // Rotation rate around X-axis (degrees/second)
            "rotationRate.gamma",                // Rotation rate around Y-axis (degrees/second)
          ],
          
          // Function to record device motion data for training/data collection
          record: function (/** @type {DeviceMotionEvent} */ evt) {
            // Call the generic record function with processed event data
            record(
              evt.type, // Event type ("devicemotion")
              // Convert the extracted key-value pairs to an object
              Object.fromEntries(
                getValuesBySelectors(evt, sensors[evt.type].keys)
              ),
              // Calculate absolute timestamp by adding event timestamp to performance time origin
              evt.timeStamp + performance.timeOrigin
            );
          },
        },
      };

      /**
       * Asynchronous function to start recording sensor data for machine learning training
       * Sets up data collectors for each sensor type and registers event listeners
       */
      async function start_recording() {
        // Iterate through each sensor configuration (deviceorientation, devicemotion)
        for (var [sensor, fun] of Object.entries(sensors)) {
          // Create a data collector for this sensor using EdgeML
          fun.collector = await edgeML.datasetCollector(
            "https://edge-ml-beta.dmz.teco.edu", // Backend URL where data will be sent
            "5fe6e50c3fb5001531bbd8e03a8c591f", // API key for authentication with the backend
            sensor, // Name for the dataset (e.g., "deviceorientation", "devicemotion")
            false, // False indicates we will provide our own timestamps instead of using server timestamps
            fun.keys, // Array of time-series names to create in the dataset
            // Merge participant/activity info with default device tags
            Object.assign(
              {
                participantId: document.getElementById("subject").value, // Get participant ID from form
                activity: document.getElementById("label").value,        // Get activity label from form
              },
              defaultTags // Add browser/mobile device information
            ),
            "activity_" + document.getElementById("label").value // Label prefix for the dataset
          );

          // Register event listener to capture sensor data when events occur
          // 'true' parameter enables capturing phase (events are captured before bubbling)
          window.addEventListener(sensor, fun.record, true);
        }
      }

      /**
       * Asynchronous function to start real-time classification of sensor data
       * Sets up ML predictors for each sensor type and begins continuous prediction
       */
      async function start_classifying() {
        // Iterate through each sensor configuration
        for (var [sensor, f] of Object.entries(sensors)) {
          const fun = f; // Create local reference to sensor configuration
          // Check if this sensor has a scoring/classification function
          if ("score" in fun) {
            // Create a new EdgeML predictor instance with the loaded model parameters
            fun.classifier = await new edgeML.Predictor(
              fun.model.score,    // The model's scoring function
              fun.model.inputs,   // Input feature names expected by the model
              fun.model.window,   // Time window size for feature extraction
              fun.model.classes,  // Output class names the model can predict
              fun.model.scale     // Scaling parameters for input normalization
            );

            // Register event listener to feed sensor data to the classifier
            window.addEventListener(sensor, fun.score, true);

            // Set up a timer to run predictions every 1000ms (1 second)
            timer = window.setInterval(function () {
              const curfun = fun; // Capture current sensor configuration in closure
              // Request a prediction from the classifier
              curfun.classifier
                .predict()
                // Handle any errors during prediction
                .catch((error) => {
                  console.log(error); // Log errors to browser console
                })
                // Handle successful prediction results
                .then((output) => {
                  // Display the prediction results in the debug div as formatted JSON
                  document.getElementById("debug").innerHTML = JSON.stringify(
                    output, // The prediction output object
                    null,   // No replacer function
                    2       // 2-space indentation for readable formatting
                  );
                });
            }, 1000); // Execute every 1000 milliseconds
          }
        }
      }

      /**
       * Asynchronous function to stop recording sensor data
       * Removes event listeners and completes data collection
       */
      async function stop_recording() {
        // Iterate through each sensor configuration
        for (const [sensor, fun] of Object.entries(sensors)) {
          // Remove the event listener to stop capturing new sensor data
          window.removeEventListener(sensor, fun.record, true);
          // Complete the data collection process (sends any remaining data to server)
          await fun.collector.onComplete();
        }
      }

      /**
       * Asynchronous function to stop real-time classification
       * Removes event listeners and clears the prediction timer
       */
      async function stop_classifying() {
        // Iterate through each sensor configuration
        for (const [sensor, fun] of Object.entries(sensors)) {
          // Check if this sensor has classification capability
          if ("score" in fun) {
            // Remove the event listener to stop feeding data to the classifier
            window.removeEventListener(sensor, fun.score, true);
          }
        }
      }

      /**
       * Function to record sensor data points for training data collection
       * @param {string} eventtype - Type of sensor event (e.g., "deviceorientation", "devicemotion")
       * @param {Object} fields - Object containing sensor data fields and their values
       * @param {number} eventtime - Timestamp when the event occurred
       */
      function record(eventtype, fields, eventtime) {
        // Iterate through each field in the sensor data
        for (const [key, value] of Object.entries(fields)) {
          // Only record non-null values to avoid corrupting the dataset
          if (value !== null) {
            // Add the data point to the appropriate sensor's data collector
            sensors[eventtype].collector.addDataPoint(
              Math.floor(eventtime), // Convert timestamp to integer milliseconds
              key,                   // The sensor field name (e.g., "alpha", "acceleration.x")
              value                  // The actual sensor reading value
            );
          }
        }
      }

      /**
       * Function to feed sensor data to the classifier for real-time prediction
       * @param {string} eventtype - Type of sensor event (e.g., "deviceorientation", "devicemotion")
       * @param {Object} fields - Object containing sensor data fields and their values
       * @param {number} eventtime - Timestamp when the event occurred
       */
      function score(eventtype, fields, eventtime) {
        // Iterate through each field in the sensor data
        for (const [key, value] of Object.entries(fields)) {
          // Only feed non-null values to the classifier
          if (value !== null) {
            // Add the data point to the appropriate sensor's classifier
            sensors[eventtype].classifier.addDataPoint(
              Math.floor(eventtime), // Convert timestamp to integer milliseconds
              key,                   // The sensor field name (e.g., "alpha", "acceleration.x")
              value                  // The actual sensor reading value
            );
          }
        }
      }

      // Event handler for the recording checkbox - controls data collection on/off
      document.getElementById("record").onchange = function () {
        // Check if the checkbox is now checked (recording should start)
        if (this.checked) {
          // Start recording sensor data for training
          start_recording();
          // Update the debug display to show recording status
          document.getElementById("debug").innerHTML = "Recording.";
        } else {
          // Stop recording sensor data
          stop_recording();
          // Update the debug display to show stopped status
          document.getElementById("debug").innerHTML = "Not recording.";
        }
      };

      // Event handler for the classification checkbox - controls real-time prediction on/off
      document.getElementById("classify").onchange = function () {
        // Check if the checkbox is now checked (classification should start)
        if (this.checked) {
          // Start real-time classification of sensor data
          start_classifying();
          // Update the debug display to show classification status
          document.getElementById("debug").innerHTML = "Recording.";
        } else {
          // Stop real-time classification
          stop_classifying();
          // Update the debug display to show stopped status
          document.getElementById("debug").innerHTML = "Not recording.";
        }
      };
      
      // Set initial status message indicating the system is ready
      document.getElementById("debug").innerHTML = "Initialized.";
    };

    // Append the dynamically created script element to the document body to execute it
    // This triggers the loading and execution of the machine learning model
    document.body.appendChild(script);
  });
