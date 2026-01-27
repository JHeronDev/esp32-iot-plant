#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <BH1750.h>
#include <Adafruit_BMP280.h>

// ================= CONFIGURATION RAILWAY =================
// Remplace par l'URL/IP du broker MQTT de Railway
// Exemple: "mosquitto-service.railway.app" ou "123.456.789.10"
const char* MQTT_HOST = "mqtt-production-9d1e.up.railway.app";
const int   MQTT_PORT = 1883;
// Authentification MQTT (optionnel, dépend de ta config Mosquitto)
const char* MQTT_USER = "";  // Laisser vide si pas de username
const char* MQTT_PASS = "";  // Laisser vide si pas de password
// ==========================================================

#define I2C_SDA 22
#define I2C_SCL 21
#define SOIL_PIN 34
#define LED_PIN 2
#define FAN_PIN 14
#define HUMIDIFIER_PIN 27
#define CTP_SDA 18
#define CTP_SCL 19

const char* WIFI_SSID = "CFAINSTA_STUDENTS";
const char* WIFI_PASS = "Cf@InSt@-$tUd3nT";
const int   MQTT_PORT  = 1883;
const char* TOPIC_TELEMETRY = "tp/esp32/telemetry";
const char* TOPIC_CMD       = "tp/esp32/cmd";

WiFiClient espClient;
PubSubClient mqtt(espClient);
BH1750 lightMeter;
Adafruit_BMP280 bmp; // I2C

// Pression au niveau de la mer (hPa) pour calcul altitude
const float SEA_LEVEL_HPA = 1013.25;

// États des appareils
bool ledOn = false;
bool fanOn = false;
bool humidifierOn = false;

unsigned long lastSend = 0;
unsigned long lastRetry = 0;
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

void tryConnectMQTT() {
  if (!mqtt.connected() && millis() - lastRetry > retryInterval) {
    lastRetry = millis();
    Serial.print("[MQTT] Tentative de connexion à ");
    Serial.print(MQTT_HOST);
    Serial.print(":");
    Serial.print(MQTT_PORT);
    Serial.print("... ");
    
    String clientId = "ESP32-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    
    // Connexion avec ou sans authentification
    bool connected = false;
    if (strlen(MQTT_USER) > 0) {
      connected = mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    } else {
      connected = mqtt.connect(clientId.c_str());
    }
    
    if (connected) {
      mqtt.subscribe(TOPIC_CMD);
      Serial.println("OK ✓");
    } else {
      Serial.print("ÉCHEC (code: ");
      Serial.print(mqtt.state());
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
  espClient.setTimeout(2000); 

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);

  lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire);
  
  // Init BMP280
  bool ok = bmp.begin(0x76);
  if (!ok) ok = bmp.begin(0x77);
  if (!ok) {
    Serial.println("Erreur: BMP280 introuvable en I2C (0x76/0x77). Vérifie câblage.");
  } else {
    bmp.setSampling(
      Adafruit_BMP280::MODE_NORMAL,
      Adafruit_BMP280::SAMPLING_X2,   // Température
      Adafruit_BMP280::SAMPLING_X16,  // Pression
      Adafruit_BMP280::FILTER_X16,
      Adafruit_BMP280::STANDBY_MS_500
    );
    Serial.println("BMP280 OK.");
  }
  
  Serial.println("\nPrêt !");
}

void loop() {
  // 1. Priorité au traitement des messages (Actions rapides)
  mqtt.loop();

  // 2. Tentatives de connexion
  tryConnectMQTT();

  // 3. Envoi des données
  unsigned long now = millis();
  if (now - lastSend >= 2000) {
    lastSend = now;

    float lux = lightMeter.readLightLevel();
    int soilRaw = analogRead(SOIL_PIN);
    float soilPercent = map(soilRaw, 4095, 0, 0, 100);
    float temperature = bmp.readTemperature();
    float pressurePa = bmp.readPressure();
    float pressurehPa = pressurePa / 100.0;

    String payload = "{\"luminosite\":" + String(lux) + 
                     ",\"humidite_sol\":" + String(soilPercent) + 
                     ",\"temperature\":" + String(temperature, 2) +
                     ",\"pressure\":" + String(pressurehPa, 2) +
                     ",\"rssi\":" + String(WiFi.RSSI()) + 
                     ",\"led_on\":" + (ledOn ? "true" : "false") +
                     ",\"fan_on\":" + (fanOn ? "true" : "false") +
                     ",\"humidifier_on\":" + (humidifierOn ? "true" : "false") + "}";

    if (mqtt.connected()) mqtt.publish(TOPIC_TELEMETRY, payload.c_str());
  }
}