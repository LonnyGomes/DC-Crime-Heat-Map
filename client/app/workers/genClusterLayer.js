/*global onmessage, self, setTimeout, clearTimeout, postMessage, generateKey, importScripts */
importScripts("../utils.js");
var curStartIdx = 0,
    chunkOffset = 1500,
    data = [],
    dataLen = 0,
    timeoutVal = 300, //milliseconds
    timeoutObj;

function processChunk() {
    "use strict";

    var dataSlice, nextStartIdx;

    if (self.curStartIdx >= (self.dataLen - 1)) {
        //we've reached the end of the dataset, send the complete message
        postMessage({
            status: "complete"
        });

        //stop interval and terminate worker
        clearTimeout(self.timeoutObj);
        self.close();
    } else if ((self.dataLen - self.curStartIdx) < self.chunkOffset) {
        dataSlice = self.data.slice(self.curStartIdx);
        postMessage({
            status: "loading",
            data: dataSlice
        });
        self.curStartIdx = self.dataLen - 1;

        //run the last chunk
        self.timeoutObj = setTimeout(processChunk, self.timeoutVal);
    } else {
        //calc the index for the next chunk of data points
        nextStartIdx =  self.curStartIdx + self.chunkOffset;

        //make sure it doesn't exceed bounds of the data array
        if (nextStartIdx >= self.dataLen) {
            nextStartIdx = self.dataLen - 1;
        }

        //get the next chunk of data
        dataSlice = self.data.slice(self.curStartIdx, nextStartIdx);
        postMessage({
            status: "loading",
            data: dataSlice,
            data2: dataSlice.map(function (d) {
                return [d.lat, d.lon, d.offense];
            })
        });
        self.curStartIdx = nextStartIdx;

        //run the next chunk
        self.timeoutObj = setTimeout(processChunk, self.timeoutVal);
    }
}

onmessage = function (e) {
    "use strict";

    var filter = e.data.filter;

    //save reference to data
    self.data = e.data.data;

    if (filter !== undefined) {
        self.data = self.data.filter(function (curObj) {
            //if the offense type for the data point is in
            //the list, then include it
            return (filter[generateKey(curObj.offense)] === true);
        });
    }
    self.dataLen = self.data.length;
    self.chunkOffset = self.dataLen / 4;
    //start the timeout "loop"
    self.timeoutObj = setTimeout(processChunk, self.timeoutVal);
};
