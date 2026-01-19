#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <BH1750.h>

#define I2C_SDA 22
#define I2C_SCL 21
#define SOIL_PIN 34
#define LED_PIN 2
#define FAN_PIN 14

const char* WIFI_SSID = "CFAINSTA_STUDENTS";
const char* WIFI_PASS = "Cf@InSt@-$tUd3nT";
const char* MQTT_HOST = "172.16.8.41";
const int   MQTT_PORT = 1883;

const char* TOPIC_TELEMETRY = "tp/esp32/telemetry";
const char* TOPIC_CMD       = "tp/esp32/cmd";

WiFiClient espClient;
PubSubClient mqtt(espClient);
BH1750 lightMeter;

unsigned long lastSend = 0;

void onMessage(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

  Serial.println("=== MQTT MESSAGE RECU ===");
  Serial.print("Topic: "); Serial.println(topic);
  Serial.print("Payload: "); Serial.println(msg);

  if (String(topic) == TOPIC_CMD) {
    // Contrôle de la LED (Pin 2)
    if (msg == "LED_ON") {
      digitalWrite(LED_PIN, HIGH);
      Serial.println("[ACTION] LED -> ON");
    } 
    else if (msg == "LED_OFF") {
      digitalWrite(LED_PIN, LOW);
      Serial.println("[ACTION] LED -> OFF");
    }
    // NOUVEAU : Contrôle du ventilateur (Pin 14)
    else if (msg == "FAN_ON") {
      digitalWrite(FAN_PIN, HIGH);
      Serial.println("[ACTION] FAN -> ON");
    }
    else if (msg == "FAN_OFF") {
      digitalWrite(FAN_PIN, LOW);
      Serial.println("[ACTION] FAN -> OFF");
    }
  }
}

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\n[WIFI] Connecté !");
}

void connectMQTT() {
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  while (!mqtt.connected()) {
    String clientId = "ESP32-Plant-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqtt.connect(clientId.c_str())) {
      mqtt.subscribe(TOPIC_CMD);
    } else { delay(2000); }
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(I2C_SDA, I2C_SCL);
  pinMode(LED_PIN, OUTPUT);
  pinMode(SOIL_PIN, INPUT); // Capteur d'humidité
pinMode(FAN_PIN, OUTPUT);
  digitalWrite(FAN_PIN, LOW);

  connectWiFi();
  connectMQTT();
  lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire);
}

void loop() {
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();

  unsigned long now = millis();
  if (now - lastSend >= 2000) {
    lastSend = now;

    // Lecture Lumière
    float lux = lightMeter.readLightLevel();

    // Lecture Humidité du sol
    int soilRaw = analogRead(SOIL_PIN);
    // Conversion en % (0 = Sec, 100 = Très humide)
    // Note : 4095 est la valeur max de l'ADC ESP32
    float soilPercent = map(soilRaw, 4095, 0, 0, 100); 

    // Construction du JSON avec les deux capteurs
    String payload = "{";
    payload += "\"luminosite\":" + String(lux);
    payload += ",\"humidite_sol\":" + String(soilPercent);
    payload += ",\"rssi\":" + String(WiFi.RSSI());
    payload += "}";

    Serial.println("Publie: " + payload);
    mqtt.publish(TOPIC_TELEMETRY, payload.c_str());
  }
}