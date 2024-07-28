import { useEffect, useRef } from "react";
import Draw, { DrawEvent } from "ol/interaction/Draw.js";
import Map from "ol/Map.js";
import Overlay from "ol/Overlay.js";
import View from "ol/View.js";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style.js";
import { LineString, Polygon, Geometry } from "ol/geom.js";
import { OSM, Vector as VectorSource } from "ol/source.js";
import { Tile as TileLayer, Vector as VectorLayer } from "ol/layer.js";
import { getArea, getLength } from "ol/sphere.js";
import { unByKey } from "ol/Observable.js";
import { Feature } from "ol";
import MapBrowserEvent from "ol/MapBrowserEvent.js";
import { EventsKey } from "ol/events";
import GeoJSON from "ol/format/GeoJSON";

const App = () => {
  const sourceRef = useRef<VectorSource<Feature<Geometry>> | null>(null);

  useEffect(() => {
    const raster = new TileLayer({
      source: new OSM(),
    });

    const source = new VectorSource();
    sourceRef.current = source;

    const vector = new VectorLayer({
      source: source,
      style: new Style({
        fill: new Fill({
          color: "rgba(255, 255, 255, 0.2)",
        }),
        stroke: new Stroke({
          color: "#ffcc33",
          width: 2,
        }),
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({
            color: "#ffcc33",
          }),
        }),
      }),
    });

    const map = new Map({
      layers: [raster, vector],
      target: "map",
      view: new View({
        center: [-11000000, 4600000],
        zoom: 15,
      }),
    });

    let sketch: Feature<Geometry> | null = null;
    let helpTooltipElement: HTMLDivElement | null = null;
    let helpTooltip: Overlay | null = null;
    let measureTooltipElement: HTMLDivElement | null = null;
    let measureTooltip: Overlay | null = null;
    const continuePolygonMsg = "Click to continue drawing the polygon";
    const continueLineMsg = "Click to continue drawing the line";

    const pointerMoveHandler = function (evt: MapBrowserEvent<UIEvent>) {
      if (evt.dragging) {
        return;
      }
      let helpMsg = "Click to start drawing";

      if (sketch) {
        const geom = sketch.getGeometry();
        if (geom instanceof Polygon) {
          helpMsg = continuePolygonMsg;
        } else if (geom instanceof LineString) {
          helpMsg = continueLineMsg;
        }
      }

      if (helpTooltipElement) {
        helpTooltipElement.innerHTML = helpMsg;
        if (helpTooltip) {
          helpTooltip.setPosition(evt.coordinate);
        }
        helpTooltipElement.classList.remove("hidden");
      }
    };

    map.on("pointermove", pointerMoveHandler);

    map.getViewport().addEventListener("mouseout", function () {
      if (helpTooltipElement) {
        helpTooltipElement.classList.add("hidden");
      }
    });

    const typeSelect = document.getElementById("type") as HTMLSelectElement;
    let draw: Draw | null = null; // global so we can remove it later

    const formatLength = function (line: LineString): string {
      const length = getLength(line);
      let output;
      if (length > 100) {
        output = Math.round((length / 1000) * 100) / 100 + " km";
      } else {
        output = Math.round(length * 100) / 100 + " m";
      }
      return output;
    };

    const formatPerimeter = function (polygon: Polygon): string {
      const perimeter = getLength(polygon);
      let output;
      if (perimeter > 100) {
        output = Math.round((perimeter / 1000) * 100) / 100 + " km";
      } else {
        output = Math.round(perimeter * 100) / 100 + " m";
      }
      return output;
    };

    const formatArea = function (polygon: Polygon): string {
      const area = getArea(polygon);
      let output;
      if (area > 10000) {
        output = Math.round((area / 1000000) * 100) / 100 + " km<sup>2</sup>";
      } else {
        output = Math.round(area * 100) / 100 + " m<sup>2</sup>";
      }
      return output;
    };

    const style = new Style({
      fill: new Fill({
        color: "rgba(255, 255, 255, 0.2)",
      }),
      stroke: new Stroke({
        color: "rgba(0, 0, 0, 0.5)",
        lineDash: [10, 10],
        width: 2,
      }),
      image: new CircleStyle({
        radius: 5,
        stroke: new Stroke({
          color: "rgba(0, 0, 0, 0.7)",
        }),
        fill: new Fill({
          color: "rgba(255, 255, 255, 0.2)",
        }),
      }),
    });

    function addInteraction() {
      const type = typeSelect.value === "area" ? "Polygon" : "LineString";

      draw = new Draw({
        source: source,
        type: type,
        style: function (feature) {
          const geometryType = feature?.getGeometry()?.getType();
          if (geometryType === type || geometryType === "Point") {
            return style;
          }
        },
      });
      map.addInteraction(draw);

      createMeasureTooltip();
      createHelpTooltip();

      let listener: EventsKey;
      draw.on("drawstart", function (evt: DrawEvent) {
        sketch = evt.feature;

        let tooltipCoord: number[] = (
          evt.feature.getGeometry() as LineString
        ).getFirstCoordinate() || [0, 0];

        const geometry = sketch.getGeometry();
        if (geometry) {
          listener = geometry.on("change", function (evt) {
            const geom = evt.target as Geometry;
            let output;
            if (geom instanceof Polygon) {
              const area = formatArea(geom);
              const perimeter = formatPerimeter(geom);
              output = `Area: ${area}<br>Perimeter: ${perimeter}`;
              tooltipCoord = geom.getInteriorPoint().getCoordinates();
            } else if (geom instanceof LineString) {
              output = formatLength(geom);
              tooltipCoord = geom.getLastCoordinate();
            }
            if (measureTooltipElement) {
              measureTooltipElement.innerHTML = output || "";
              if (measureTooltip) {
                measureTooltip.setPosition(tooltipCoord);
              }
            }
          }) as EventsKey;
        }
      });

      draw.on("drawend", function (evt) {
        if (measureTooltipElement) {
          measureTooltipElement.className = "ol-tooltip ol-tooltip-static";
          if (measureTooltip) {
            measureTooltip.setOffset([0, -7]);
          }
        }

        const feature = evt.feature;
        const geom = feature.getGeometry();

        if (geom instanceof Polygon) {
          const area = formatArea(geom);
          const perimeter = formatPerimeter(geom);
          feature.setProperties({
            area: area,
            perimeter: perimeter,
          });
        } else if (geom instanceof LineString) {
          const length = formatLength(geom);
          feature.setProperties({
            length: length,
          });
        }

        sketch = null;
        measureTooltipElement = null;
        createMeasureTooltip();
        unByKey(listener);
      });
    }

    function createHelpTooltip() {
      if (helpTooltipElement) {
        helpTooltipElement.remove();
      }
      helpTooltipElement = document.createElement("div");
      helpTooltipElement.className = "ol-tooltip hidden";
      helpTooltip = new Overlay({
        element: helpTooltipElement,
        offset: [15, 0],
        positioning: "center-left",
      });
      map.addOverlay(helpTooltip);
    }

    function createMeasureTooltip() {
      if (measureTooltipElement) {
        measureTooltipElement.remove();
      }
      measureTooltipElement = document.createElement("div");
      measureTooltipElement.className = "ol-tooltip ol-tooltip-measure";
      measureTooltip = new Overlay({
        element: measureTooltipElement,
        offset: [0, -15],
        positioning: "bottom-center",
        stopEvent: false,
        insertFirst: false,
      });
      map.addOverlay(measureTooltip);
    }

    typeSelect.onchange = function () {
      if (draw) {
        map.removeInteraction(draw);
      }
      addInteraction();
    };

    addInteraction();
  }, []);

  const exportToGeoJSON = (source: VectorSource) => {
    const features = source.getFeatures();
    const geoJSON = new GeoJSON().writeFeaturesObject(features);
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(geoJSON));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "data.geojson");
    document.body.appendChild(downloadAnchorNode); // Required for Firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <div>
      <div id="map" className="h-[70vh] w-[100vw] map"></div>
      <form className="ml-4">
        <label htmlFor="type">Measurement type &nbsp;</label>
        <select id="type">
          <option value="length">Length (LineString)</option>
          <option value="area">Area (Polygon)</option>
        </select>

        <div>
          <button
            className="border border-black px-2 py-1 rounded-lg mt-2"
            onClick={() => {
              if (sourceRef.current !== null)
                exportToGeoJSON(sourceRef.current);
            }}
          >
            Export
          </button>
        </div>
      </form>
    </div>
  );
};

export default App;
