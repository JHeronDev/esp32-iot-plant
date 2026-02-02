#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <BH1750.h>
#include <Adafruit_BME280.h>
#include <adafruit_sensor.h>

// ================= CONFIGURATION MQTT =================
// Railway TCP Proxy (voir Settings -> Networking)
const char* MQTT_HOST = "ballast.proxy.rlwy.net";
const int   MQTT_PORT = 18302;
// Authentification MQTT
const char* MQTT_USER = "";  // Laisser vide (allow_anonymous true)
const char* MQTT_PASS = "";
// ==========================================================

#define I2C_SDA 22
#define I2C_SCL 21
#define SOIL_PIN 34
#define LED_PIN 10
#define FAN_PIN 14
#define HUMIDIFIER_PIN 27
#define CTP_SDA 2
#define CTP_SCL 15

const char* WIFI_SSID = "CFAINSTA_STUDENTS";
const char* WIFI_PASS = "Cf@InSt@-$tUd3nT";
const char* TOPIC_TELEMETRY = "tp/esp32/telemetry";
const char* TOPIC_CMD       = "tp/esp32/cmd";

WiFiClient espClient;
PubSubClient mqtt(espClient);
BH1750 lightMeter;
Adafruit_BME280 bme; // I2C

// Flags pour suivi des capteurs
bool bh1750_ok = false;
bool bme280_ok = false;
// Pression au niveau de la mer (hPa) pour calcul altitude
const float SEA_LEVEL_HPA = 1013.25;

// États des appareils
bool ledOn = false;
bool fanOn = false;
bool humidifierOn = false;

unsigned long lastSend = 0;
unsigned long lastRetry = 0;
const int retryInterval = 10000;    // Tentative connexion toutes les 10s
const int sendInterval = 5000;      // Envoyer les données toutes les 5s


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
    Serial.print("[MQTT] Connexion à ");
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
      int code = mqtt.state();
      Serial.print("ÉCHEC (");
      Serial.print(code);
      Serial.print(") ");
      
      // Diagnostics détaillés
      switch(code) {
        case -4: Serial.println("TIMEOUT - Serveur ne répond pas"); break;
        case -3: Serial.println("CONNEXION PERDUE"); break;
        case -2: 
          Serial.println("ÉCHEC RÉSEAU - Vérifier:");
          Serial.println("  1. Le hostname est-il résolvable? (ping)");
          Serial.println("  2. Le port est-il correct?");
          Serial.println("  3. Railway expose-t-il le port 1883 publiquement?");
          break;
        case -1: Serial.println("DÉCONNECTÉ"); break;
        case 1: Serial.println("PROTOCOLE MQTT INVALIDE"); break;
        case 2: Serial.println("CLIENT_ID REJETÉ"); break;
        case 3: Serial.println("SERVEUR INDISPONIBLE"); break;
        case 4: Serial.println("AUTHENTIFICATION ÉCHOUÉE"); break;
        case 5: Serial.println("NON AUTORISÉ"); break;
        default: Serial.println("ERREUR INCONNUE");
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n=== ESP32 IoT Plant Monitor ===");
  
  Wire.begin(I2C_SDA, I2C_SCL);
  pinMode(LED_PIN, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);
  pinMode(HUMIDIFIER_PIN, OUTPUT);

  Serial.print("[WiFi] Connexion à ");
  Serial.print(WIFI_SSID);
  Serial.print("... ");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println(" OK");
  Serial.print("[WiFi] IP: ");
  Serial.println(WiFi.localIP());
  
  Serial.print("[MQTT] Configuration: ");
  Serial.print(MQTT_HOST);
  Serial.print(":");
  Serial.println(MQTT_PORT);
  
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqtt.setKeepAlive(60);
  mqtt.setSocketTimeout(15);

  lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire);
  bh1750_ok = true;
  
  // Init BMP280
  bool ok = bme.begin(0x76);
  if (!ok) ok = bme.begin(0x77);
  if (!ok) {
    Serial.println("Erreur: BME280 introuvable en I2C (0x76/0x77). Vérifie câblage.");
  } else {
    bme280_ok = true;
    bme.setSampling(
      Adafruit_BME280::MODE_NORMAL,
      Adafruit_BME280::SAMPLING_X2,   // Température
      Adafruit_BME280::SAMPLING_X16,  // Pression
      Adafruit_BME280::SAMPLING_X1,   // Humidité
      Adafruit_BME280::FILTER_X16,    // Filtre
      Adafruit_BME280::STANDBY_MS_500
    );
    Serial.println("BME280 OK.");
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
  if (now - lastSend >= sendInterval) {
    lastSend = now;
    
    // Lire les capteurs avec vérifications
    int lux = bh1750_ok ? (int)lightMeter.readLightLevel() : -1;
    int soilRaw = analogRead(SOIL_PIN);
    int soilPercent = map(soilRaw, 4095, 0, 0, 100);
    int temperature = bme280_ok ? (int)bme.readTemperature() : -999;
    int humidity = bme280_ok ? (int)bme.readHumidity() : -1;
    int pressurePa = bme280_ok ? (int)bme.readPressure() : 0;
    int pressurehPa = pressurePa / 100;

    // Debug en série
    if (lux < 0) Serial.println("[ERROR] BH1750 pas disponible - vérifier connexion I2C");

    String payload = "{\"luminosite\":" + String(lux) + 
                     ",\"humidite_sol\":" + String(soilPercent) + 
                     ",\"temperature\":" + String(temperature) +
                     ",\"humidite_air\":" + String(humidity) +
                     ",\"pressure\":" + String(pressurehPa) +
                     ",\"rssi\":" + String(WiFi.RSSI()) + 
                     ",\"led_on\":" + (ledOn ? "true" : "false") +
                     ",\"fan_on\":" + (fanOn ? "true" : "false") +
                     ",\"humidifier_on\":" + (humidifierOn ? "true" : "false") + "}";

    if (mqtt.connected()) mqtt.publish(TOPIC_TELEMETRY, payload.c_str());
  }
  
  delay(100); // Petit délai pour ne pas surcharger le CPU
}