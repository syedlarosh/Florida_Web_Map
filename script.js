// =============================================================
// 1. PASSWORD LOGIC (Linked to Google Sheet)
// =============================================================
const SHEET_ID = "1rbkmNuSTSY9mZvWm6ss1zHDfJWSLfSBwzW5quEARIQY";

// We use the JSON endpoint to fetch the sheet data
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

let dynamicPassword = "Ramsey"; // Fallback default

async function fetchPasswordFromSheet() {
    try {
        const response = await fetch(SHEET_URL);
        const text = await response.text();
        
        // The response is a JS wrapper: /*O_o*/ google.visualization.Query.setResponse({...});
        // We extract the JSON part between the first '{' and the last '}'
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        
        if (jsonStart === -1 || jsonEnd === -1) {
            throw new Error("Could not find JSON in response");
        }
        
        const jsonStr = text.substring(jsonStart, jsonEnd + 1);
        const data = JSON.parse(jsonStr);

        if (data.table && data.table.rows && data.table.rows.length > 0) {
            // Loop through rows to find the first non-empty text (ignoring headers like "Password")
            for (let r = 0; r < data.table.rows.length; r++) {
                const row = data.table.rows[r];
                if (row.c && row.c.length > 0) {
                    for (let c = 0; c < row.c.length; c++) {
                        const cell = row.c[c];
                        if (cell && cell.v != null) {
                            const val = String(cell.v).trim();
                            // Skip if the cell is just a header label
                            if (val.toLowerCase() !== "password" && val !== "") {
                                dynamicPassword = val;
                                console.log("✅ Password fetched from Google Sheet:", dynamicPassword);
                                return; // Found it, exit function
                            }
                        }
                    }
                }
            }
        }
        console.log("⚠️ Could not find a valid password in the sheet. Using fallback.");
    } catch (err) {
        console.warn("⚠️ Could not fetch password from Google Sheet. Using fallback 'Ramsey'.", err);
    }
}

async function initPasswordProtection() {
    const overlay = document.getElementById("passwordOverlay");
    const app = document.getElementById("mainApp");
    const input = document.getElementById("passwordInput");
    const btn = document.getElementById("passwordSubmit");
    const errorDiv = document.getElementById("passwordError");

    // Fetch latest password from Google Sheet BEFORE user tries to enter
    await fetchPasswordFromSheet();
    
    // Debug log (You can remove this later)
    console.log("Current expected password:", dynamicPassword);

    btn.addEventListener("click", () => {
        // Trim spaces from both to avoid hidden space issues
        const entered = input.value.trim();
        
        if (entered === dynamicPassword) {
            overlay.style.display = "none";
            app.style.display = "block";
            // Initialize the map ONLY AFTER password is verified
            initializeMap();
        } else {
            errorDiv.textContent = "Incorrect password. Please try again.";
            input.value = "";
            input.focus();
        }
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") btn.click();
    });
}

// =============================================================
// 2. MAP INITIALIZATION
// =============================================================
const webmapId = "3eba42e174e54fafafc4d63a9b4b703e";
const PARCEL_URL = "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0";
const PARCEL_FIELD = "PARCEL_ID";
const GEOCODE_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer";

async function initializeMap() {
    const layersList = document.getElementById("layersList");
    const statusEl   = document.getElementById("searchStatus");

    function setStatus(msg, kind) {
        if (!statusEl) return;
        statusEl.textContent = msg || "";
        statusEl.className = "search-status" + (kind ? " " + kind : "");
    }

    function fatal(msg, err) {
        console.error("FATAL:", msg, err || "");
        if (layersList) {
            layersList.innerHTML = `<div class='error-box'><strong>Map initialization failed.</strong><br><br>Error: ${msg}<br><br>Check console for details.</div>`;
        }
        setStatus("Initialization failed — see panel.", "err");
    }

    try {
        let WebMap, MapView, FeatureLayer, Graphic, Point;

        [WebMap, MapView, FeatureLayer, Graphic, Point] = await $arcgis.import([
            "@arcgis/core/WebMap.js",
            "@arcgis/core/views/MapView.js",
            "@arcgis/core/layers/FeatureLayer.js",
            "@arcgis/core/Graphic.js",
            "@arcgis/core/geometry/Point.js"
        ]);

        const webmap = new WebMap({ portalItem: { id: webmapId } });
        const view = new MapView({ container: "viewDiv", map: webmap });

        await view.when();

        const parcelLayer = new FeatureLayer({
            url: PARCEL_URL,
            title: "Florida Parcels (FDOR 2024)",
            outFields: ["PARCEL_ID", "OWN_NAME", "PHY_ADDR1", "CO_NO"],
            visible: true
        });

        await parcelLayer.load();
        view.map.add(parcelLayer);

        // Layers Panel Render
        layersList.innerHTML = "";
        function addLayers(collection, container, level = 0) {
            collection.forEach(layer => {
                const item = document.createElement("div");
                item.className = "layer-item";

                const row = document.createElement("div");
                row.className = "layer-row";

                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = layer.visible;
                checkbox.addEventListener("change", () => { layer.visible = checkbox.checked; });

                const name = document.createElement("span");
                name.className = "layer-name";
                name.textContent = layer.title || "Untitled Layer";

                row.style.paddingLeft = `${12 + level * 18}px`;
                row.appendChild(checkbox);
                row.appendChild(name);
                item.appendChild(row);
                container.appendChild(item);

                if (layer.layers && layer.layers.length > 0) addLayers(layer.layers, item, level + 1);
                if (layer.sublayers && layer.sublayers.length > 0) addLayers(layer.sublayers, item, level + 1);
            });
        }
        addLayers(view.map.layers, layersList);
        document.getElementById("layerCount").textContent = `${view.map.allLayers.length} Layers`;

        // Search Logic
        const addressInput = document.getElementById("addressInput");
        const parcelInput  = document.getElementById("parcelInput");
        
        function clearHighlight() { view.graphics.removeAll(); }

        async function runAddressSearch() {
            const value = addressInput.value.trim();
            if (!value) return setStatus("Please type an address.", "err");

            setStatus("Looking up address…");
            try {
                const url = `${GEOCODE_URL}/findAddressCandidates?f=json&SingleLine=${encodeURIComponent(value)}&outFields=*&maxLocations=1`;
                const response = await fetch(url);
                const data = await response.json();

                if (!data.candidates || data.candidates.length === 0) return setStatus("No match for that address.", "err");

                const c = data.candidates[0];
                const geoPoint = new Point({ longitude: c.location.x, latitude: c.location.y, spatialReference: { wkid: 4326 } });

                setStatus("Address found. Locating parcel…");
                await view.goTo({ center: geoPoint, zoom: 17 });

                const q = parcelLayer.createQuery();
                q.geometry = geoPoint;
                q.spatialRelationship = "intersects";
                q.returnGeometry = true;
                q.outFields = ["*"];
                q.num = 1;

                const res = await parcelLayer.queryFeatures(q);
                if (res.features.length > 0) {
                    const feature = res.features[0];
                    clearHighlight();
                    view.graphics.add(new Graphic({
                        geometry: feature.geometry,
                        symbol: { type: "simple-fill", color: [23, 54, 93, 0.2], outline: { color: [23, 54, 93], width: 2 } }
                    }));
                    await view.goTo({ target: feature.geometry.extent.expand(2) });
                    setStatus(`Found parcel: ${feature.attributes.PARCEL_ID}`, "ok");
                } else {
                    setStatus("Address matched, but no parcel was found here.", "err");
                }
            } catch (err) {
                setStatus("Address lookup failed.", "err");
            }
        }

        async function runParcelSearch() {
            const value = parcelInput.value.trim();
            if (!value) return setStatus("Please type a parcel number.", "err");

            setStatus("Searching for parcel…");
            try {
                const q = parcelLayer.createQuery();
                q.where = `${PARCEL_FIELD} = '${value.replace(/'/g, "''")}'`;
                q.returnGeometry = true;
                q.outFields = ["*"];
                q.num = 1;

                const res = await parcelLayer.queryFeatures(q);
                if (res.features.length > 0) {
                    const feature = res.features[0];
                    if (!parcelLayer.visible) parcelLayer.visible = true;
                    
                    clearHighlight();
                    view.graphics.add(new Graphic({
                        geometry: feature.geometry,
                        symbol: { type: "simple-fill", color: [23, 54, 93, 0.2], outline: { color: [23, 54, 93], width: 2 } }
                    }));

                    await view.goTo({ target: feature.geometry.extent.expand(2), zoom: 17 });
                    setStatus(`Found parcel: ${value}`, "ok");
                } else {
                    setStatus(`No parcel found for "${value}".`, "err");
                }
            } catch (err) {
                setStatus("Parcel search failed.", "err");
            }
        }

        document.getElementById("addressBtn").addEventListener("click", runAddressSearch);
        document.getElementById("parcelBtn").addEventListener("click", runParcelSearch);
        addressInput.addEventListener("keydown", e => { if (e.key === "Enter") runAddressSearch(); });
        parcelInput.addEventListener("keydown", e => { if (e.key === "Enter") runParcelSearch(); });

        // Tabs
        document.querySelectorAll(".search-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                document.querySelectorAll(".search-tab").forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                const target = tab.dataset.tab;
                document.getElementById("tab-address").classList.toggle("hidden", target !== "address");
                document.getElementById("tab-parcel").classList.toggle("hidden", target !== "parcel");
                setStatus("");
            });
        });

        setStatus(`Ready. Use Address or Parcel # above.`, "");
    } catch (error) {
        fatal(error.message || String(error), error);
    }
}

// Start the app by checking password first
initPasswordProtection();