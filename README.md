# CSS Browser Demo

This project is a small browser application that collects motion sensor data and
classifies activities on the client side using the [edge-ml](https://www.npmjs.com/package/@triedel/edge-ml) library.
Data can optionally be recorded and uploaded to a backend for further training.

## Running the demo

```bash
npm install
npm start
```

This launches a development server and opens `src/index.html` with live reload
enabled. Open the page on a mobile device to record device orientation and
motion data.

## Building for production

```bash
npm run build
```

The build artifacts will be generated in the `dist` folder.

