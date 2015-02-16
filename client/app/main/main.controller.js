/*jslint nomen: true */
/*global angular,$, L, Backbone, console, alert, Handlebars, Worker, insertCommas, _ */
(function () {
    'use strict';
    var app = angular.module('dcCrimeHeatmapApp');
    app.controller('MainCtrl', function ($scope, $http, socket, crimeData) {
        var App = window.App || {},
            MainApp = {
                map: null,
                curHeatLayer: null,
                clusterLayer: {}, // object to store point layer groups
                worker: null,
                totalsWorker: null,
                legendView: null,
                curYear: "2014", //TODO: do not hardcode this
                config: {
                    minZoom: 11,
                    startZoom: 12,
                    maxZoom: 19,
                    startCoords: [38.9, -77.02]
                },
                initialize: function () {
                    var self = this;

                    //download all heatmap data
                    this.downloadData();

                    this.map = this.initMap();

                    $("#layerButtons a").click(function (e) {
                        var btnEl = $(this),
                            btnName = btnEl.text();

                        $("#layerButtons a").removeClass("activeButton");
                        btnEl.addClass("activeButton");
                    });

                    //this.registerHandlebarsHelpers();
                },
                initMap: function () {
                    //set up map
                    var parent = this,
                        map = L.mapbox.map('map', 'uknowho.map-wc8j7l0g', {
                            minZoom: parent.config.minZoom,
                            maxZoom: parent.config.maxZoom
                        }).setView(parent.config.startCoords, parent.config.startZoom);

                    //add heat layer with empty set for now
                    this.curHeatLayer = L.heatLayer([], {
                        maxZoom: parent.config.maxZoom,
                        max: 0.7,
                        radius: 30
                    });
                    this.curHeatLayer.addTo(map);

                    //create cluster layer where all the points are held
                    this.clusterLayer = L.markerClusterGroup({
                        iconCreateFunction: function (cluster) {
                            var childCount = cluster.getChildCount(),
                                c = ' marker-cluster-';
                            if (childCount < 10) {
                                c += 'small';
                            } else if (childCount < 100) {
                                c += 'medium';
                            } else {
                                c += 'large';
                            }

                            return new L.DivIcon({
                                html: '<div><span>' + insertCommas(childCount) + '</span></div>',
                                className: 'marker-cluster' + c,
                                iconSize: new L.Point(40, 40)
                            });
                        }
                    });
                    this.clusterLayer.addTo(map);

                    return map;
                },
                registerHandlebarsHelpers: function () {
                    var parent = this;

                    Handlebars.registerHelper('listCrime', function (items, options) {
                        var key,
                            idx,
                            curData,
                            curImgTag,
                            html = "<ul>\n";

                        for (idx = 0; idx < items.length; idx += 1) {
                            curData = items[idx];
                            curImgTag = '<img class="mapLegendIcon" src="' +
                                parent.IconFactory.getIconPath(curData.offense) +
                                '" alt="' + curData.offenseFormatted + ' icon" >';
                            html += "\t<li>" + curImgTag + " " +
                                options.fn(curData) +
                                "<input class='mapLegendToggle' " +
                                "data-offense='" + curData.offense + "' " +
                                "type='checkbox' checked>" +
                                "</li>\n";
                        }

                        return html + "</ul>";
                    });
                },
                loadHeatMapLayer: function (m, crimeData) {
                    if (this.curHeatLayer) {
                        this.curHeatLayer.setLatLngs(crimeData);
                    }
                },
                downloadData: function () {
                    var that = this,
                        progBar = $("#progressBar"),
                        progBarMeter = progBar.find("span"),
                        getCurData = function (m) {
                            $("#progressContainer").css("display", "none");
                            console.log(m);
                            return crimeData.getData(crimeData.yearsData.curYear);
                        },
                        populateData = function (data) {
                            that.loadHeatMapLayer(that.map, data);
                            that.calcTotals(data);
                            return data;
                        };

                    crimeData.downloadData()
                        .then(getCurData)
                        .then(populateData)
                        .then(function (data) {
                            console.log("IT WORKED");
                            that.loadClusterData(data, that.clusterLayer);
                        },
                            function (err) {
                                console.log("FAIL :(");
                            },
                            function (progress) {
                                console.log(progress);
                            });
                },
                updateYear: function (year) {
                    var self = this;
                    self.curYear = year;

                    crimeData.getData(year).then(function (data) {
                        self.loadHeatMapLayer(self.map, data);

                        self.loadClusterData(data, self.clusterLayer);

                        self.calcTotals(data);
                        data = null;
                    });

                },
                loadClusterData: function (data, clusterGroup, legendState) {
                    var parent = this;

                    //remove all points before proceeding
                    clusterGroup.clearLayers();

                    //TODO: handle this better for unsupported browsers
                    //check if browser supports web workers
                    if (typeof (Worker) !== "undefined") {
                        //if a worker is running, stop it
                        if (this.worker !== null) {
                            this.worker.terminate();
                        }

                        this.worker = new Worker("app/workers/genClusterLayer.js");

                        this.worker.onmessage = function (e) {
                            var obj = e.data,
                                idx,
                                curCoord,


                                marker,
                                curMarkers = [],
                                options = {};
                            if (obj.status === "loading") {
                                for (idx = 0; idx < obj.data.length; idx += 1) {
                                    curCoord = obj.data[idx];
                                    options = {
                                        icon: parent.IconFactory.genIcon(curCoord[2])
                                    };

                                    marker = L.marker([curCoord[0], curCoord[1]], options);
                                    marker.bindPopup(curCoord[2]);
                                    curMarkers.push(marker);
                                }
                                clusterGroup.addLayers(curMarkers);
                            } else if (obj.status === "complete") {
                                //show message
                                parent.showMessage("Loaded Crime data points");
                            }
                        };

                        //pass in the Leaflet object to the worker
                        this.worker.postMessage({
                            data: data,
                            filter: legendState
                        });
                    } else {
                        alert("Web workers aren't supported on your browser. No plotting for you!");
                    }
                },
                calcTotals: function (data) {
                    var parent = this,
                        legendModel = new this.MapLegendModel({
                            crimeTotals: new parent.CrimeTotalsCollection()
                        });

                    //                if (this.legendView === null) {
                    //                    this.legendView = new this.MapLegendView({model: legendModel});
                    //                    //set up listener for when map legend is toggled
                    //                    this.legendView.on("mapLegned:legendToggled", function (e) {
                    //                        var curData = parent.downloadQueue.getResult("crimeData" + parent.curYear);
                    //
                    //                        parent.loadClusterData(curData, parent.clusterLayer, e.legendState);
                    //                        //alert("TODO: handle legend toggled event!" + curData);
                    //                    });
                    //                }

                    if (typeof (Worker) !== "undefined") {
                        //if a worker is running, stop it
                        if (this.totalsWorker !== null) {
                            this.totalsWorker.terminate();
                        }

                        this.totalsWorker = new Worker("app/workers/calcTotalsWorker.js");

                        this.totalsWorker.onmessage = function (e) {
                            var totals = e.data,
                                curTotal,
                                template,
                                htmlStr;

                            //parent.legendView.model.set({crimeTotals: totals });
                        };

                        //start the web worker
                        this.totalsWorker.postMessage(data);
                    } else {
                        alert("Web workers aren't supported on your browser. No plotting for you!");
                    }
                },
                IconFactory: {
                    iconURLs: {
                        RedIcon: '../assets/images/marker-icon-red.png',
                        TheftIcon: '../assets/images/theft.png',
                        HomicideIcon: '../assets/images/homicide.png',
                        CarIcon: '../assets/images/car.png',
                        RobberyIcon: '../assets/images/robbery.png',
                        SexAssultIcon: '../assets/images/sex_assult.png'
                    },
                    icons: {
                        RedIcon: L.Icon.Default.extend({
                            options: {
                                iconUrl: '../assets/images/marker-icon-red.png'
                            }
                        }),
                        TheftIcon: L.Icon.Default.extend({
                            options: {
                                iconSize: [30, 30],
                                iconAnchor: [15, 30],
                                iconUrl: '../assets/images/theft.png'
                            }
                        }),
                        HomicideIcon: L.Icon.Default.extend({
                            options: {
                                iconSize: [30, 30],
                                iconAnchor: [15, 30],
                                iconUrl: '../assets/images/homicide.png'
                            }
                        }),
                        CarIcon: L.Icon.Default.extend({
                            options: {
                                iconSize: [30, 30],
                                iconAnchor: [15, 30],
                                iconUrl: '../assets/images/car.png'
                            }
                        }),
                        RobberyIcon: L.Icon.Default.extend({
                            options: {
                                iconSize: [30, 30],
                                iconAnchor: [15, 30],
                                iconUrl: '../assets/images/robbery.png'
                            }
                        }),
                        SexAssultIcon: L.Icon.Default.extend({
                            options: {
                                iconSize: [30, 30],
                                iconAnchor: [15, 30],
                                iconUrl: '../assets/images/sex_assult.png'
                            }
                        })

                    },
                    getIconKey: function (offenseType) {
                        var iconKey;

                        if (offenseType.match(/HOMICIDE/i)) {
                            iconKey = "HomicideIcon";
                        } else if (offenseType.match(/MOTOR VEHICLE/i) || offenseType.match(/STOLEN AUTO/i)) {
                            iconKey = "CarIcon";
                        } else if (offenseType.match(/[\w\W]*THEFT[\w\W]*/i)) {
                            iconKey = "TheftIcon";
                        } else if (offenseType.match(/ROBBERY/i)) {
                            iconKey = "RobberyIcon";
                        } else if (offenseType.match(/SEX[\w\W]*/i)) {
                            iconKey = "SexAssultIcon";
                        } else {
                            iconKey = "RedIcon";
                        }

                        return iconKey;
                    },
                    getIconPath: function (offenseType) {
                        var iconKey = this.getIconKey(offenseType);

                        //return relative URL path based off of iconKey
                        return this.iconURLs[iconKey];
                    },
                    genIcon: function (offenseType) {
                        var iconKey = this.getIconKey(offenseType);

                        //instanciate icon and return it
                        return new this.icons[iconKey]();
                    }
                },
                showMessage: function (msg) {
                    //populate data with text
                    $("#messageModal p").html("<h5>" + msg + "</h5>");

                    //show modal
                    $('#messageModal').foundation('reveal', 'open');

                    //hide it after a few seconds
                    setTimeout(function () {
                        $('#messageModal').foundation('reveal', 'close');
                    }, 1500);
                }

            };

        $scope.$watch(function () {return crimeData.yearsData.curYear; },
            function (oldVal, newVal, s) {
                console.log("ya?" + newVal);
                App.updateYear(newVal);
            });
        //define backbone objects
        App.CrimeTotalsModel = Backbone.Model.extend({
            id: "",
            offense: "",
            offenseFormatted: "",
            total: 0,
            totalFormatted: ""
        });

        App.CrimeTotalsCollection = Backbone.Collection.extend({
            model: App.CrimeTotalsModel
        });

        App.MapLegendModel = Backbone.Model.extend({
            crimeTotals: []
        });

        //on document ready
        $(function () {
            //initialize foundation
            //$(document).foundation();

            //extend everything from main app
            _.extend(App, MainApp);

            App.initialize();
        });





        //    $scope.awesomeThings = [];
        //
        //    $http.get('/api/things').success(function(awesomeThings) {
        //      $scope.awesomeThings = awesomeThings;
        //      socket.syncUpdates('thing', $scope.awesomeThings);
        //    });
        //
        //    $scope.addThing = function() {
        //      if($scope.newThing === '') {
        //        return;
        //      }
        //      $http.post('/api/things', { name: $scope.newThing });
        //      $scope.newThing = '';
        //    };
        //
        //    $scope.deleteThing = function(thing) {
        //      $http.delete('/api/things/' + thing._id);
        //    };
        //
        //    $scope.$on('$destroy', function () {
        //      socket.unsyncUpdates('thing');
        //    });
    });
}());