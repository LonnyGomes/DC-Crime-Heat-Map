/*global angular, insertCommas, generateKey, L, Worker */
(function () {
    'use strict';

    angular.module('dcCrimeHeatmapApp.mainMap', [
        'dcCrimeHeatMapApp.mainMap.ctrl',
        'dcCrimeHeatmapApp.mainMap.icons',
        'dcCrimeHeatmapApp.crimeDataFactory',
        'dcCrimeHeatmapApp.modalComponent'
    ])
        .directive('mainMap', function (IconFactory, crimeData, $q, Modal) {
            var config = {
                    minZoom: 11,
                    startZoom: 12,
                    maxZoom: 19,
                    startCoords: [38.9, -77.02]
                },
                map,
                curData,
                worker = null,
                curHeatLayer,
                clusterLayer;

            function initMap(config) {
                //set up map
                var map = L.mapbox.map('map', 'uknowho.map-wc8j7l0g', {
                        minZoom: config.minZoom,
                        maxZoom: config.maxZoom
                    }).setView(config.startCoords, config.startZoom);

                //add heat layer with empty set for now
//                curHeatLayer = L.heatLayer([], {
//                    maxZoom: config.maxZoom,
//                    max: 0.7,
//                    radius: 30
//                });
//                curHeatLayer.addTo(map);

                //create cluster layer where all the points are held
                clusterLayer = L.markerClusterGroup({
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
                clusterLayer.addTo(map);

                return map;
            }

            function loadHeatMapLayer(m, heatLayer, cData, filter) {
                var filteredData;
                if (heatLayer) {

                    if (filter !== undefined) {
                        filteredData = cData.filter(function (curObj) {
                            return filter[generateKey(curObj.offense)];
                        });
                        heatLayer.setLatLngs(filteredData.map(function (curObj) {
                            return [curObj.lat, curObj.lon];
                        }));
                    } else {
                        heatLayer.setLatLngs(cData.map(function (curObj) {
                            return [curObj.lat, curObj.lon];
                        }));
                    }

                }
            }

            function loadClusterData(data, clusterGroup, legendState) {
                var defer = $q.defer();
                //remove all points before proceeding
                clusterGroup.clearLayers();

                //TODO: handle this better for unsupported browsers
                //check if browser supports web workers
                if (typeof (Worker) !== "undefined") {
                    //if a worker is running, stop it
                    if (worker !== null) {
                        worker.terminate();
                    }

                    worker = new Worker("app/workers/genClusterLayer.js");

                    worker.onmessage = function (e) {
                        var obj = e.data,
                            idx,
                            curCoord,
                            marker,
                            curMarkers = [],
                            options = {},
                            startTime,
                            endTime;

                        if (obj.status === "loading") {
                            startTime = new Date().getTime();
                            for (idx = 0; idx < obj.data.length; idx += 1) {
                                curCoord = obj.data[idx];
                                options = {
                                    icon: IconFactory.genIcon(curCoord.offense)
                                };

                                marker = L.marker([curCoord.lat, curCoord.lon], options);
                                marker.bindPopup(curCoord.offense);
                                curMarkers.push(marker);
                            }
                            clusterGroup.addLayers(curMarkers);
                            endTime = new Date().getTime();
                            console.log("Time:" + ((endTime - startTime) / 1000.0));
                        } else if (obj.status === "complete") {
                            //show message
                            //parent.showMessage("Loaded Crime data points");
                            defer.resolve("Finished loading data points");
                        }
                    };

                    //pass in the Leaflet object to the worker
                    worker.postMessage({
                        data: data,
                        filter: legendState
                    });
                } else {
                    defer.reject("Web workers aren't supported on your browser. No plotting for you!");
                }

                return defer.promise;
            }

            function updateYear(year, cData) {
                cData.getData(year).then(function (data) {
                    if (map) {
                        //loadHeatMapLayer(map, data);
                    }

                    if (clusterLayer) {
                        loadClusterData(data, clusterLayer);
                    }

                    //self.calcTotals(data);
                    data = null;
                });
            }

            function showMessage(msg, title) {
                //show modal
                var modal = Modal.info(),
                    modalTile = title || 'Success',
                    modalInstance = modal('Data complete', msg);

                //hide the modal it after a few seconds
                setTimeout(function () {
                    modalInstance.close();
                }, 1500);
            }

            return {
                templateUrl: 'app/mainMap/mainMap.html',
                restrict: 'EA',
                controller: 'MainMapCtrl',
                controllerAs: 'ctrl',
                bindToController: true,
                link: function (scope, element, attrs) {
                    //initialize map
                    map = initMap(config);

                    scope.$watch('status.curCrimeData', function (newVal, oldVal) {
                        if (newVal && newVal.length > 0) {
                            if (map) {
                                //loadHeatMapLayer(map, curHeatLayer, newVal);
                                loadClusterData(newVal, clusterLayer, undefined).then(
                                    function (msg) {
                                        showMessage(msg);
                                    },
                                    function (err) {
                                        //TODO: popup error version of modal
                                        showMessage(err);
                                    }
                                );
                            }
                        }
                    });

                    scope.$watch('legendState', function (newVal, oldVal) {
                        if (newVal && Object.keys(newVal).length > 0) {
                            console.log("Legend state changed:");
                            console.dir(newVal);

                            loadClusterData(scope.status.curCrimeData, clusterLayer, newVal).then(
                                function (msg) {
                                    //loadHeatMapLayer(map, curHeatLayer, scope.status.curCrimeData, newVal);
                                    showMessage(msg);
                                },
                                function (err) {
                                    //TODO: popup error version of modal
                                    showMessage(err);
                                }
                            );

                        }
                    }, true);
                }
            };
        });

}());
