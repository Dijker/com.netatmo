# NetAtmo for Homey

This app supports multiple NetAtmo devices on Homey. Support includes:

- NetAtmo Weather Station + modules
    - Read sensors
        * Battery Level
        * Temperature
        * Humidity
        * CO2 (Carbon Dioxide)
        * Atmospheric Pressure
        * Noise
        * Rain (now, mm/hour, cumulated today)
        * Humidity
        * Wind Strength
        * Wind Angle
        * Gust Strength
        * Gust Angle
- NetAtmo Thermostat
    - Read sensors
        * Temperature
        * Target Temperature
    - Set capability
        * Target Temperature
        * Active Program
        * Active Mode

**Note:**
There will be 3 "Rain" global tokens until that [issue](https://github.com/athombv/homey/issues/1588) is fixed.  
For now, the order is always the same:  
* Top Rain: Rain now
* Middle Rain: mm/hour
* Bottom Rain: Cummulated today

Support to be added:
- NetAtmo Welcome:
    * NetAtmo Tags
    * NetAtmo Smart Smoke Alarm
- NetAtmo Presence
- NetAtmo Healthy Home Coach

### Changelog:
- 2.0.6: (re-pair is needed for the extra capabilities)
    * Added battery levels
    * Added rain: mm/hour and 24h accumulated
