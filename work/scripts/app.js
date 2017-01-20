// Copyright 2016 Google Inc.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//      http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


(function() {
  'use strict';

  var app = {
    isLoading: true,
    visibleCards: {},
    selectedCities: [],
    spinner: document.querySelector('.loader'),
    cardTemplate: document.querySelector('.cardTemplate'),
    container: document.querySelector('.main'),
    openweatherAppId: '', // sign up at: http://openweathermap.org/price#weather and place your app id key here
    addDialog: document.querySelector('.dialog-container'),
    daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  };


  /*****************************************************************************
   *
   * Event listeners for UI elements
   *
   ****************************************************************************/

  document.getElementById('butRefresh').addEventListener('click', function() {
    // Refresh all of the forecasts
    app.updateForecasts();
  });

  document.getElementById('butAdd').addEventListener('click', function() {
    // Open/show the add new city dialog
    app.toggleAddDialog(true);
  });

  document.getElementById('butAddCity').addEventListener('click', function() {
    // Add the newly selected city
    var select = document.getElementById('selectCityToAdd');
    var selected = select.options[select.selectedIndex];
    var key = selected.value;
    var label = selected.textContent;
    if (!app.selectedCities) {
      app.selectedCities = [];
    }
    app.getForecast(key, label);
    app.selectedCities.push({key: key, label: label});
    app.saveSelectedCities();
    app.toggleAddDialog(false);
  });

  document.getElementById('butAddCancel').addEventListener('click', function() {
    // Close the add new city dialog
    app.toggleAddDialog(false);
  });


  /*****************************************************************************
   *
   * Methods to update/refresh the UI
   *
   ****************************************************************************/

  // Toggles the visibility of the add new city dialog.
  app.toggleAddDialog = function(visible) {
    if (visible) {
      app.addDialog.classList.add('dialog-container--visible');
    } else {
      app.addDialog.classList.remove('dialog-container--visible');
    }
  };

  // openweathermap.org returns unixstamp and sets it's time to 5pm.
  // Function converts unixstamp and sets dynamic hours and minutes.
  // Also wets variable for if it's day or night for temperature display
  app.convertDate = function(date){
    var state = 'day';
    var a = new Date(date * 1000);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var year = a.getFullYear();
    var month = months[a.getMonth()];
    var date = a.getDate();

    var time = new Date(Date.now());

    var hour = time.getHours();
    var min = time.getMinutes();

    if(hour > 18 || hour < 5){
      state = 'night';
    }

    var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min;
    return {date:time, state:state};
  }

  // Updates a weather card with the latest weather forecast. If the card
  // doesn't already exist, it's cloned from the template.
  app.updateForecastCard = function(data) {
    var dataLastUpdated = new Date(data.created);
    
    var date = app.convertDate(data.list[1].dt);
    var current = {text: data.list[1].weather[0].main, date:date.date, temp:data.list[1].temp[date.state],code:data.list[1].weather[0].id}
    var humidity = data.list[1].humidity;
    var wind = {speed:data.list[1].speed, direction:data.list[1].deg};

    var card = app.visibleCards[data.city.id];
    if (!card) {
      card = app.cardTemplate.cloneNode(true);
      card.classList.remove('cardTemplate');
      card.querySelector('.location').textContent = data.city.name;
      card.removeAttribute('hidden');
      app.container.appendChild(card);
      app.visibleCards[data.city.id] = card;
    }

    // Verifies the data provide is newer than what's already visible
    // on the card, if it's not bail, if it is, continue and update the
    // time saved in the card
    var cardLastUpdatedElem = card.querySelector('.card-last-updated');
    var cardLastUpdated = cardLastUpdatedElem.textContent;
    if (cardLastUpdated) {
      cardLastUpdated = new Date(cardLastUpdated);
      // Bail if the card has more recent data then the data
      if (dataLastUpdated.getTime() < cardLastUpdated.getTime()) {
        return;
      }
    }
    cardLastUpdatedElem.textContent = data.created;

    card.querySelector('.description').textContent = current.text;
    card.querySelector('.date').textContent = current.date;
    card.querySelector('.current .icon').classList.add(app.getIconClass(current.code));
    card.querySelector('.current .temperature .value').textContent =
      Math.round(current.temp);

    // No sunrise or sunset from openweathermap.org :(  
    //card.querySelector('.current .sunrise').textContent = sunrise;
    //card.querySelector('.current .sunset').textContent = sunset;

    card.querySelector('.current .humidity').textContent =
      Math.round(humidity) + '%';
    card.querySelector('.current .wind .value').textContent =
      Math.round(wind.speed);
    card.querySelector('.current .wind .direction').textContent = wind.direction;
    var nextDays = card.querySelectorAll('.future .oneday');
    var today = new Date();
    today = today.getDay();
    for (var i = 0; i < 7; i++) {
      var nextDay = nextDays[i];
      var daily = {code:data.list[i].weather[0].id, high:data.list[i].temp.max,low:data.list[i].temp.min}
      if (daily && nextDay) {
        nextDay.querySelector('.date').textContent =
          app.daysOfWeek[(i + today) % 7];
        nextDay.querySelector('.icon').classList.add(app.getIconClass(daily.code));
        nextDay.querySelector('.temp-high .value').textContent =
          Math.round(daily.high);
        nextDay.querySelector('.temp-low .value').textContent =
          Math.round(daily.low);
      }
    }
    if (app.isLoading) {
      app.spinner.setAttribute('hidden', true);
      app.container.removeAttribute('hidden');
      app.isLoading = false;
    }
  };


  /*****************************************************************************
   *
   * Methods for dealing with the model
   *
   ****************************************************************************/

  /*
   * Gets a forecast for a specific city and updates the card with the data.
   * getForecast() first checks if the weather data is in the cache. If so,
   * then it gets that data and populates the card with the cached data.
   * Then, getForecast() goes to the network for fresh data. If the network
   * request goes through, then the card gets updated a second time with the
   * freshest data.
   */
  app.getForecast = function(key, label) {
    var url = 'http://api.openweathermap.org/data/2.5/forecast/daily?id='+key+'&units=imperial&appid='+app.openweatherAppId+'&cnt=8'
    // TODO add cache logic here

    // Fetch the latest data.
    var request = new XMLHttpRequest();
    request.onreadystatechange = function() {
      if (request.readyState === XMLHttpRequest.DONE) {
        if (request.status === 200) {
          var response = JSON.parse(request.response);
          var results = response;
          results.key = key;
          results.label = label;
          results.created = Date.now();
          app.updateForecastCard(results);
        }
      } else {
        // Return the initial weather forecast since no data is available.
        app.updateForecastCard(initialWeatherForecast);
      }
    };
    request.open('GET', url);
    request.send();
  };

  // Iterate all of the cards and attempt to get the latest forecast data
  app.updateForecasts = function() {
    var keys = Object.keys(app.visibleCards);
    keys.forEach(function(key) {
      app.getForecast(key);
    });
  };

  // TODO add saveSelectedCities function here

  app.saveSelectedCities = function() {
    var selectedCities = JSON.stringify(app.selectedCities);
    localStorage.selectedCities = selectedCities;
  };

  app.getIconClass = function(weatherCode) {
    // Weather codes: https://openweathermap.org/weather-conditions
    weatherCode = parseInt(weatherCode);
    switch (weatherCode) {
      case 800: // clear sky
        return 'clear-day';
      case 500: // light rain
      case 501: // moderate rain
      case 502: // heavy intensity rain
      case 503: // very heavy rain
      case 504: // extreme rain
      case 511: // freezing rain
      case 520: // light intensity shower rain
      case 521: // shower rain
      case 522: // heavy intensity shower rain
      case 531: // ragged shower rain
        return 'rain';
      case 200: // thunderstorm with light rain
      case 201: // thunderstorm with rain
      case 202: // thunderstorm with heavy rain
      case 210: // light thunderstorm
      case 211: // thunderstorm
      case 212: // heavy thunderstorm
      case 221: // ragged thunderstorm
      case 230: // thunderstorm with light drizzle
      case 231: // thunderstorm with drizzle
      case 232: // thunderstorm with heavy drizzle    
        return 'thunderstorms';
      case 600: // light snow
      case 601: // snow
      case 602: // heavy snow
      case 611: // sleet
      case 612: // shower sleet
      case 615: // light rain and snow
      case 616: // rain and snow
      case 620: // light shower snow
      case 621: // shower snow
      case 622: // heavy shower snow
        return 'snow';
      case 701: // mist
      case 711: // smoke
      case 721: // haze
      case 731: // sand, dust whirls
      case 741: // fog
      case 751: // sand
      case 761: // dust
      case 762: // volcanic ash
      case 771: // squalls
      case 781: // tornado
        return 'fog';
      case 900:	//tornado
      case 901:	//tropical storm
      case 902:	//hurricane
      case 903:	//cold
      case 904:	//hot
      case 905:	//windy
      case 906:	//hail
        return 'windy';
      case 803:	// broken clouds
      case 804:	// overcast clouds
        return 'cloudy';
      case 801:	// few clouds
      case 802:	// scattered clouds
        return 'partly-cloudy-day';
    }
  };

  /*
   * Fake weather data that is presented when the user first uses the app,
   * or when the user has not saved any cities. See startup code for more
   * discussion.
   */
  var initialWeatherForecast = {
    city: {
      id: 5128638,
      name: "New York",
      coord: {
        lon: -75.499901,
        lat: 43.000351
      },
      country: "US",
      population: 0
    },
    cerated: 1484906400, // created 01/20/2016 10:00:00
    cod: "200",
    message: 0.0517,
    cnt: 8,
    list: [{
      dt: 1484845200,
      temp: {
        day: 33.8,
        min: 33.8,
        max: 33.8,
        night: 33.8,
        eve: 33.8,
        morn: 33.8
      },
      pressure: 982.94,
      humidity: 99,
      weather: [{
        id: 802,
        main: "Clouds",
        description: "scattered clouds",
        icon: "03n"
      }],
      speed: 2.15,
      deg: 227,
      clouds: 48
    }, {
      dt: 1484931600,
      temp: {
        day: 40.23,
        min: 29.21,
        max: 40.23,
        night: 36.03,
        eve: 34.23,
        morn: 29.21
      },
      pressure: 979.69,
      humidity: 74,
      weather: [{
        id: 800,
        main: "Clear",
        description: "clear sky",
        icon: "01d"
      }],
      speed: 3.53,
      deg: 129,
      clouds: 48,
      rain: 0.4
    }, {
      dt: 1485018000,
      temp: {
        day: 48.11,
        min: 37.71,
        max: 48.11,
        night: 39.16,
        eve: 42.37,
        morn: 37.71
      },
      pressure: 975.22,
      humidity: 92,
      weather: [{
        id: 500,
        main: "Rain",
        description: "light rain",
        icon: "10d"
      }],
      speed: 3.15,
      deg: 240,
      clouds: 92,
      rain: 1.52
    }, {
      dt: 1485104400,
      temp: {
        day: 42.17,
        min: 34.81,
        max: 42.17,
        night: 34.81,
        eve: 37.74,
        morn: 35.24
      },
      pressure: 969.8,
      humidity: 0,
      weather: [{
        id: 501,
        main: "Rain",
        description: "moderate rain",
        icon: "10d"
      }],
      speed: 4.05,
      deg: 122,
      clouds: 99,
      rain: 3.76
    }, {
      dt: 1485190800,
      temp: {
        day: 35.24,
        min: 32.88,
        max: 35.83,
        night: 35.83,
        eve: 35.69,
        morn: 32.88
      },
      pressure: 961.93,
      humidity: 0,
      weather: [{
        id: 601,
        main: "Snow",
        description: "snow",
        icon: "13d"
      }],
      speed: 14.05,
      deg: 83,
      clouds: 100,
      rain: 19.53,
      snow: 1.94
    }, {
      dt: 1485277200,
      temp: {
        day: 36.91,
        min: 30.6,
        max: 36.91,
        night: 30.6,
        eve: 33.73,
        morn: 35.46
      },
      pressure: 964.31,
      humidity: 0,
      weather: [{
        id: 600,
        main: "Snow",
        description: "light snow",
        icon: "13d"
      }],
      speed: 5.48,
      deg: 43,
      clouds: 100,
      rain: 5.02,
      snow: 0.79
    }, {
      dt: 1485363600,
      temp: {
        day: 36.21,
        min: 28.45,
        max: 39.34,
        night: 39.34,
        eve: 33.67,
        morn: 28.45
      },
      pressure: 968.74,
      humidity: 0,
      weather: [{
        id: 600,
        main: "Snow",
        description: "light snow",
        icon: "13d"
      }],
      speed: 3.09,
      deg: 159,
      clouds: 82,
      rain: 1.61,
      snow: 0.08
    }, {
      dt: 1485450000,
      temp: {
        day: 37.09,
        min: 30,
        max: 41.4,
        night: 30,
        eve: 33.31,
        morn: 41.4
      },
      pressure: 964.02,
      humidity: 0,
      weather: [{
        id: 600,
        main: "Snow",
        description: "light snow",
        icon: "13d"
      }],
      speed: 8.57,
      deg: 273,
      clouds: 99,
      rain: 3.8,
      snow: 1.2
    }]
  };
  // TODO uncomment line below to test app with fake data
  //app.updateForecastCard(initialWeatherForecast);

  // TODO add startup code here

  app.selectedCities = localStorage.selectedCities;
  if (app.selectedCities) {
    app.selectedCities = JSON.parse(app.selectedCities);
    app.selectedCities.forEach(function(city) {
      app.getForecast(city.key, city.label);
    });
  } else {
    /* The user is using the app for the first time, or the user has not
     * saved any cities, so show the user some fake data. A real app in this
     * scenario could guess the user's location via IP lookup and then inject
     * that data into the page.
     */
    app.updateForecastCard(initialWeatherForecast);
    app.selectedCities = [
      {key: initialWeatherForecast.city.id, label: initialWeatherForecast.city.name}
    ];
    app.saveSelectedCities();
  }

  // TODO add service worker code here
})();
