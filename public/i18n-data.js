(() => {
  'use strict';
  const {text,pack}=window.RobotlandI18n;
  for(const place of window.MAP_DATA.attractions){
    place.koreanName=place.name;
    place.name=pack.places[place.id]||text(place.name);
  }
  for(const category of window.MAP_DATA.categories)category.name=text(category.name);
})();
