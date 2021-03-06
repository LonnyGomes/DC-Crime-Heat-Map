/*global angular */
(function () {
    "use strict";

    function NavBarController($scope, $location, crimeData) {
        var self = this;

        self.menu = [{
            'title': 'Map',
            'link': '/'
        }];

        self.yearsData = crimeData.yearsData;

        self.isCollapsed = true;

        self.isActive = function (route) {
            return route === $location.path();
        };

        self.toggled = function (data) {
            alert("data:" + data);
        };

        self.updateCurYear = function (year) {
            crimeData.updateCurYear(year);
        };
    }

    angular.module('dcCrimeHeatmapApp.navBarComponent', [
        'dcCrimeHeatmapApp.crimeDataFactory'
    ])
        .controller('NavbarCtrl', NavBarController);

}());
