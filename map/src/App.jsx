import { useRef, useEffect, useState } from "react";
import mapboxgl from "mapbox-gl";
import { connect, consumerOpts, headers, JSONCodec } from "nats.ws";

export default function App() {
  // add access token
  mapboxgl.accessToken = "PASTE_YOUR_KEY_HERE";

  const jc = useRef(null);
  const nats = useRef(null);

  const roomId = useRef(null);
  const id = useRef(null);
  const map = useRef(null);
  const toolbar = useRef(null);
  const color = useRef(getRandomColor());

  const [activeToolbar, setActiveToolbar] = useState(null);
  const [markers, setMarkers] = useState([]);

  function getRandomColor() {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }

    return color;
  }

  const initNatsConnection = async () => {
    jc.current = JSONCodec();
    nats.current = await connect({
      servers: "ws://localhost:9222",
    });

    const opts = consumerOpts();
    opts.orderedConsumer();

    const sub = await nats.current
      ?.jetstream()
      .subscribe(`maps.${roomId.current}`, opts);
    for await (const msg of sub) {
      const data = jc.current?.decode(msg.data);
      switch (data.type) {
        case 'add-marker':
          if (data.id !== id.current) {
            const marker = new mapboxgl.Marker({
              color: data.color,
            });
            marker.setLngLat([data.lng, data.lat]);
    
            setMarkers(prev => [...prev, marker]);
          }
          break;

        case 'clear':
          setMarkers([])
          break;
      
        default:
          console.log('unknown message type', data.type);
          break;
      }
    }
  };

  useEffect(() => {
    // generate random id and room id
    id.current = Math.random().toString(36).slice(6);
    if (window.location.search) {
      const searchParams = new URLSearchParams(window.location.search);

      if (searchParams.has("room")) {
        roomId.current = searchParams.get("room");
      }
    } else {
      roomId.current = Math.random().toString(36).slice(6);
    }

    window.history.pushState({}, "", `?room=${roomId.current}`);

    map.current = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/streets-v11",
      center: [106.8289509, -6.4006064],
      zoom: 12,
    });

    map.current?.addControl(new mapboxgl.NavigationControl());

    map.current?.on("click", (e) => {
      const lngLat = e.lngLat;

      if (toolbar.current === "marker") {
        // // publish to nats
        nats.current?.publish(
          `maps.${roomId.current}`,
          jc.current?.encode({
            id: id.current,
            type: "add-marker",
            lat: lngLat.lat,
            lng: lngLat.lng,
            color: color.current
          })
        );

        const marker = new mapboxgl.Marker({
          color: color.current,
        });
        marker.setLngLat(lngLat);

        setMarkers(prev => [...prev, marker]);
      }
    });

    map.current?.on("load", async () => {
      await initNatsConnection();
    });

    return () => {
      map.current?.remove();
    };

    // eslint-disable-next-line
  }, []);

  const toggleToolbar = (name) => {
    if (toolbar.current === name) {
      toolbar.current = null;
      setActiveToolbar(null);
    } else {
      toolbar.current = name;
      setActiveToolbar(name);
    }
  };

  const clearMarkers = () => {
    let confirm = window.confirm("Are you sure want to clear all markers?");
    if (confirm) {
      const msg = { id: id.current, type: "clear" }
      const h = headers()
      h.set("Nats-Rollup", "sub")

      nats.current?.publish(`maps.${roomId.current}`, jc.current?.encode(msg), { headers: h });
    }
  }

  useEffect(() => {
    for (const marker of markers) {
      marker.addTo(map.current);
    }

    return () => {
      for (const marker of markers) {
        marker.remove();
      }
    }
  }, [markers])

  return (
    <div className="relative">
      <div className="z-[100] rounded absolute top-2 left-2 flex flex-col space-y-1">
        <div className="p-1 bg-white rounded-md flex items-center justify-center">
          <button
            onClick={() => toggleToolbar("marker")}
            type="button"
            className="inline-flex items-center rounded-md font-semibold text-sm p-2 data-[active='true']:bg-red-500 data-[active='true']:text-white"
            data-active={activeToolbar === "marker"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
              />
            </svg>
          </button>
        </div>

        <div className="p-1 bg-white rounded-md flex items-center justify-center">
          <button
            onClick={clearMarkers}
            type="button"
            className="inline-flex items-center rounded-md font-semibold text-sm p-2 hover:bg-red-500 hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
          </button>
        </div>
      </div>  
      <div id="map" className="h-screen w-screen"></div>
    </div>
  );
}
