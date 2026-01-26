#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <BH1750.h>

// ================= CONFIGURATION UTILISATEUR =================
bool USE_SERVER_1 = true;  // Mets sur false pour désactiver le PC 1
bool USE_SERVER_2 = true; // Mets sur false pour désactiver le PC 2

const char* MQTT_HOST1 = "172.16.8.81";
const char* MQTT_HOST2 = "172.16.8.8";
// =============================================================

#define I2C_SDA 22
#define I2C_SCL 21
#define SOIL_PIN 34
#define LED_PIN 2
#define FAN_PIN 14
#define HUMIDIFIER_PIN 27

const char* WIFI_SSID = "CFAINSTA_STUDENTS";
const char* WIFI_PASS = "Cf@InSt@-$tUd3nT";
const int   MQTT_PORT  = 1883;
const char* TOPIC_TELEMETRY = "tp/esp32/telemetry";
const char* TOPIC_CMD       = "tp/esp32/cmd";

WiFiClient espClient1;
WiFiClient espClient2;
PubSubClient mqtt1(espClient1);
PubSubClient mqtt2(espClient2);
BH1750 lightMeter;

// États des appareils
bool ledOn = false;
bool fanOn = false;
bool humidifierOn = false;

unsigned long lastSend = 0;
unsigned long lastRetry1 = 0;
unsigned long lastRetry2 = 0;
const int retryInterval = 5000; // Tentative toutes les 5s

void onMessage(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

  if (String(topic) == TOPIC_CMD) {
    if (msg == "LED_ON") {
      digitalWrite(LED_PIN, HIGH);
      ledOn = true;
    }
    else if (msg == "LED_OFF") {
      digitalWrite(LED_PIN, LOW);
      ledOn = false;
    }
    else if (msg == "FAN_ON") {
      digitalWrite(FAN_PIN, HIGH);
      fanOn = true;
    }
    else if (msg == "FAN_OFF") {
      digitalWrite(FAN_PIN, LOW);
      fanOn = false;
    }
    else if (msg == "HUM_ON") {
      digitalWrite(HUMIDIFIER_PIN, HIGH);
      humidifierOn = true;
    }
    else if (msg == "HUM_OFF") {
      digitalWrite(HUMIDIFIER_PIN, LOW);
      humidifierOn = false;
    }
    Serial.println("Action effectuée : " + msg);
  }
}

void tryConnectMQTT1() {
  if (USE_SERVER_1 && !mqtt1.connected() && millis() - lastRetry1 > retryInterval) {
    lastRetry1 = millis();
    Serial.print("[MQTT 1] Tentative de connexion à ");
    Serial.print(MQTT_HOST1);
    Serial.print(":");
    Serial.print(MQTT_PORT);
    Serial.print("... ");
    String clientId = "ESP32-P1-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqtt1.connect(clientId.c_str())) {
      mqtt1.subscribe(TOPIC_CMD);
      Serial.println("OK ✓");
    } else {
      Serial.print("ÉCHEC (code: ");
      Serial.print(mqtt1.state());
      Serial.println(")");
    }
  }
}

void tryConnectMQTT2() {
  if (USE_SERVER_2 && !mqtt2.connected() && millis() - lastRetry2 > retryInterval) {
    lastRetry2 = millis();
    Serial.print("[MQTT 2] Tentative de connexion à ");
    Serial.print(MQTT_HOST2);
    Serial.print(":");
    Serial.print(MQTT_PORT);
    Serial.print("... ");
    String clientId = "ESP32-P2-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqtt2.connect(clientId.c_str())) {
      mqtt2.subscribe(TOPIC_CMD);
      Serial.println("OK ✓");
    } else {
      Serial.print("ÉCHEC (code: ");
      Serial.print(mqtt2.state());
      Serial.println(")");
    }
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(I2C_SDA, I2C_SCL);
  pinMode(LED_PIN, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);
  pinMode(HUMIDIFIER_PIN, OUTPUT);

  // Timeouts WiFi (2s pour laisser le temps à la connexion TCP)
  espClient1.setTimeout(2000); 
  espClient2.setTimeout(2000);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  
  mqtt1.setServer(MQTT_HOST1, MQTT_PORT);
  mqtt1.setCallback(onMessage);
  mqtt2.setServer(MQTT_HOST2, MQTT_PORT);
  mqtt2.setCallback(onMessage);

  lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire);
  Serial.println("\nPrêt !");
}

void loop() {
  // 1. Priorité au traitement des messages (Actions rapides)
  if (USE_SERVER_1) mqtt1.loop();
  if (USE_SERVER_2) mqtt2.loop();

  // 2. Tentatives de connexion
  tryConnectMQTT1();
  tryConnectMQTT2();

  // 3. Envoi des données
  unsigned long now = millis();
  if (now - lastSend >= 2000) {
    lastSend = now;

    float lux = lightMeter.readLightLevel();
    int soilRaw = analogRead(SOIL_PIN);
    float soilPercent = map(soilRaw, 4095, 0, 0, 100); 

    String payload = "{\"luminosite\":" + String(lux) + 
                     ",\"humidite_sol\":" + String(soilPercent) + 
                     ",\"co2\":" + String(random(400, 800)) + 
                     ",\"rssi\":" + String(WiFi.RSSI()) + 
                     ",\"led_on\":" + (ledOn ? "true" : "false") +
                     ",\"fan_on\":" + (fanOn ? "true" : "false") +
                     ",\"humidifier_on\":" + (humidifierOn ? "true" : "false") + "}";

    if (USE_SERVER_1 && mqtt1.connected()) mqtt1.publish(TOPIC_TELEMETRY, payload.c_str());
    if (USE_SERVER_2 && mqtt2.connected()) mqtt2.publish(TOPIC_TELEMETRY, payload.c_str());
  }
}