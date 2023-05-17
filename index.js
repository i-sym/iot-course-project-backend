const mqtt = require("mqtt");
const express = require("express");
const bodyParser = require("body-parser");
const pocketbase = require("pocketbase/cjs");

const MQTT_HOST = "165.232.76.159";
const MQTT_PORT = 1885;

const MQTT_USER = "demo";
const MQTT_PASSWORD = "demo";

const app = express();
const port = 3000;

const mqttClient = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, {
  username: MQTT_USER,
  password: MQTT_PASSWORD,
});

pb = new pocketbase("http://165.232.76.159:8080/");

let devices = [];

mqttClient.on("connect", () => {
  console.log("Connected to MQTT broker");
});

pb.collection("devices")
  .getFullList({})
  .then((res) => {
    if (res.length == 0) {
      console.log("No devices found");
      return;
    }

    devices = res;

    res.forEach((device) => {
      if (device.topic) {
        try {
          mqttClient.subscribe(device.topic);
          console.log(`Subscribed to ${device.topic}`);
        } catch (err) {
          console.log(`Failed to subscribe to ${device.topic}`);
        }
      }
    });
  });

mqttClient.on("message", (topic, message) => {
  console.log(`Received message on topic ${topic}: ${message.toString()}`);
  const device = devices.find((d) => d.topic === topic);
  if (!device) {
    console.log(`Device not found for topic ${topic}`);
    return;
  }

  let data = null;
  try {
    data = message.toString();
    // Data is a raw number
    data = parseFloat(data);
    if (isNaN(data)) {
      throw new Error("Data is not a number");
    }
    console.log(`Parsed data ${data}`);

    
      pb.collection("devices").update(device.id, {
        lastValue: data,
      }).then((res) => {
        console.log(`Updated device ${device.id} with last value ${data}`);
        }).catch((err) => {
        console.log(`Failed to update device ${device.id} with last value ${data}`);
        });
      
        // To be fixed
    if (device.type == "activity-meter") {
    
        pb.collection("measurements").create({
          value: data,
          unit: device.type == "power-meter" ? "kW" : " /10",
          device: device.id,
          type: device.type,
          time: new Date().toISOString(),
        }).then((res) => {
            console.log(`Created measurement for device ${device.id} with value ${data}`);
        }).catch((err) => {
            console.log(`Failed to create measurement for device ${device.id} with value ${data}`);
        });
    }
  } catch (err) {
    console.log(`Failed to parse data ${data}`);
    return;
  }
});


app.get("/api/devices", async (req, res) => {
  try {
    const pbRes = await pb.collection("devices").getFullList({});
    res.send(pbRes);
  } catch (error) {
    console.log(error);
    res.status(500).send(error);
  }
});

//app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static("public")  );

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});


// Headers to allow CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "PUT, GET, POST, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  next();
});

app.post("/api/state/:id", async (req, res) => {
  const deviceID = req.params.id;
  const state = req.query.state;

  const device = devices.find((d) => d.deviceID === deviceID);
  if (!device) {
    console.log(`Device ${deviceID} not found`);
    res.status(404).send("Device not found");
    return;
  }

  console.log(`Received request to turn relay ${device.deviceID} ${state}`);

  if (state !== "on" && state !== "off") {
    res.status(400).send("Invalid state");
    console.log(`Invalid state ${state}`);
    return;
  }

  try {
    await mqttClient.publish(device.topic, state === "on" ? "1" : "0");
  } catch (err) {
    console.log(err);
    res.status(500).send(err);
  }

    pb.collection("devices").update(device.id, {
      lastValue: state === "on" ? 1 : 0,
    }).then((res) => {
        console.log(`Updated device ${device.id} with last value ${state === "on" ? 1 : 0}`);
    }).catch((err) => {
        console.log(`Failed to update device ${device.id} with last value ${state === "on" ? 1 : 0}`);
    });

  res.send("OK");
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

function saveMeasurement(measurements) {
  // Find average of measurements
  const average = measurements.reduce((a, b) => a + b, 0) / measurements.length;

  // Open file
  fs.open("measurements.txt", "a", (err, fd) => {
    if (err) {
      console.log(err);
      return;
    }

    // Write to file
    fs.write(fd, `${average}\n`, (err) => {
      if (err) {
        console.log(err);
        return;
      }
      console.log("Wrote to file");
    });
  });
}

let measurementBuffer = [];

// mqttClient.on('message', (topic, message) => {

//     console.log(`Received message on ${topic}: ${message}`);
//     if(topic === MQTT_TOPIC){
//         measurementBuffer.push(parseFloat(message.toString()));
//         if(measurementBuffer.length >= 10){
//             saveMeasurement(measurementBuffer);
//             measurementBuffer = [];
//         }
//     }
// });

//mqttClient.subscribe(MQTT_TOPIC);
