// =============================================================
// 1. PASSWORD LOGIC (Linked to Google Sheet)
// =============================================================
const SHEET_ID = "1rbkmNuSTSY9mZvWm6ss1zHDfJWSLfSBwzW5quEARIQY";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

let dynamicPassword = "Ramsey"; // Fallback default

async function fetchPasswordFromSheet() {
    try {
        const response = await fetch(SHEET_URL);
        const text = await response.text();
        
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        
        if (jsonStart === -1 || jsonEnd === -1) throw new Error("Could not find JSON");
        
        const jsonStr = text.substring(jsonStart, jsonEnd + 1);
        const data = JSON.parse(jsonStr);

        if (data.table && data.table.rows && data.table.rows.length > 0) {
            for (let r = 0; r < data.table.rows.length; r++) {
                const row = data.table.rows[r];
                if (row.c && row.c.length > 0) {
                    for (let c = 0; c < row.c.length; c++) {
                        const cell = row.c[c];
                        if (cell && cell.v != null) {
                            const val = String(cell.v).trim();
                            if (val.toLowerCase() !== "password" && val !== "") {
                                dynamicPassword = val;
                                console.log("✅ Password fetched from Google Sheet:", dynamicPassword);
                                return;
                            }
                        }
                    }
                }
            }
        }
        console.log("⚠️ Using fallback password.");
    } catch (err) {
        console.warn("⚠️ Could not fetch password. Using fallback 'Ramsey'.", err);
    }
}

async function initPasswordProtection() {
    const overlay = document.getElementById("passwordOverlay");
    const app = document.getElementById("mainApp");
    const input = document.getElementById("passwordInput");
    const btn = document.getElementById("passwordSubmit");
    const errorDiv = document.getElementById("passwordError");
    const rememberMe = document.getElementById("rememberMe");
    const togglePassword = document.getElementById("togglePassword");
    const eyeIcon = document.getElementById("eyeIcon");

    togglePassword.addEventListener("click", () => {
        if (input.type === "password") {
            input.type = "text";
            eyeIcon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
        } else {
            input.type = "password";
            eyeIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
        }
    });

    await fetchPasswordFromSheet();

    const savedPwd = localStorage.getItem("map_remembered_pwd");
    if (savedPwd === dynamicPassword) {
        overlay.style.display = "none";
        app.style.display = "block";
        initializeMap();
        return;
    }

    btn.addEventListener("click", () => {
        const entered = input.value.trim();
        if (entered === dynamicPassword) {
            if (rememberMe.checked) localStorage.setItem("map_remembered_pwd", dynamicPassword);
            else localStorage.removeItem("map_remembered_pwd");

            overlay.style.display = "none";
            app.style.display = "block";
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
const LOCALE_URL = "https://services1.arcgis.com/Ua5sjt3LWTPigjyD/ArcGIS/rest/services/Locale_Current/FeatureServer/0";

const yellowOutlineRenderer = {
    type: "simple",
    symbol: {
        type: "simple-fill",
        color: [0, 0, 0, 0], 
        outline: { color: "yellow", width: 1.5 }
    }
};

async function initializeMap() {
    const layersList = document.getElementById("layersList");
    const statusEl   = document.getElementById("searchStatus");
    const customLegend = document.getElementById("customLegend");

    // Force Legend Bar hidden right on startup
    if (customLegend) customLegend.style.display = "none";

    function setStatus(msg, kind) {
        if (!statusEl) return;
        statusEl.textContent = msg || "";
        statusEl.className = "search-status" + (kind ? " " + kind : "");
    }

    function fatal(msg, err) {
        console.error("FATAL:", msg, err || "");
        if (layersList) {
            layersList.innerHTML = `<div class='error-box'><strong>Map initialization failed.</strong><br><br>Error: ${msg}</div>`;
        }
        setStatus("Initialization failed — see panel.", "err");
    }

    try {
        let WebMap, MapView, FeatureLayer, Graphic, Point, BasemapGallery, Home, Expand;

        [WebMap, MapView, FeatureLayer, Graphic, Point, BasemapGallery, Home, Expand] = await $arcgis.import([
            "@arcgis/core/WebMap.js",
            "@arcgis/core/views/MapView.js",
            "@arcgis/core/layers/FeatureLayer.js",
            "@arcgis/core/Graphic.js",
            "@arcgis/core/geometry/Point.js",
            "@arcgis/core/widgets/BasemapGallery.js",
            "@arcgis/core/widgets/Home.js",
            "@arcgis/core/widgets/Expand.js"
        ]);

        const webmap = new WebMap({ portalItem: { id: webmapId } });
        const view = new MapView({ container: "viewDiv", map: webmap });

        await view.when();

        // CUSTOM MAP WIDGETS
        view.ui.empty("top-left");
        view.ui.add("zoom", "bottom-right");
        
        const homeWidget = new Home({ view: view });
        view.ui.add(homeWidget, { position: "bottom-right", index: 0 });

        const basemapGallery = new BasemapGallery({
            view: view,
            container: document.createElement("div"),
            source: [
                { basemap: "satellite", title: "Imagery (Satellite)" }, 
                { basemap: "hybrid", title: "Imagery with Labels" },
                { basemap: "streets-navigation-vector", title: "Streets" },
                { basemap: "topo-vector", title: "Topographic" },
                { basemap: "gray-vector", title: "Light Gray Canvas" }
            ]
        });

        const bgExpand = new Expand({
            view: view,
            content: basemapGallery,
            expandIcon: "basemap",
            expandTooltip: "Change Basemap"
        });
        
        view.ui.add(bgExpand, { position: "bottom-right", index: 1 });

        // PARCEL LAYER
        let parcelLayer = null;
        view.map.allLayers.forEach(layer => {
            const title = (layer.title || "").toLowerCase();
            if (title.includes("cadastral") || title.includes("parcel")) {
                layer.renderer = yellowOutlineRenderer;
                layer.visible = false; 
                parcelLayer = layer; 
            }
        });

        if (!parcelLayer) {
            parcelLayer = new FeatureLayer({
                url: PARCEL_URL,
                title: "Florida Parcels (FDOR 2024)",
                outFields: ["PARCEL_ID", "OWN_NAME", "PHY_ADDR1", "CO_NO"],
                visible: false,
                renderer: yellowOutlineRenderer
            });
            await parcelLayer.load();
            view.map.add(parcelLayer);
        } else {
            await parcelLayer.load();
        }

        // -------------------------------------------------------------
        // LOCALE LOOKUP LAYER
        // -------------------------------------------------------------
        const localeLayer = new FeatureLayer({
            url: LOCALE_URL,
            title: "Locale Lookup (NCES)",
            outFields: ["*"],
            visible: false, // Strictly Off by default
            legendEnabled: false,
            
            renderer: {
                type: "unique-value",
                field: "LOCALE",
                uniqueValueInfos: [
                    { value: "11", label: "City - Large",       symbol: { type: "simple-fill", color: [220, 38, 38, 0.5],  outline: { width: 0 } } },
                    { value: "12", label: "City - Midsize",     symbol: { type: "simple-fill", color: [248, 113, 113, 0.5], outline: { width: 0 } } },
                    { value: "13", label: "City - Small",       symbol: { type: "simple-fill", color: [252, 165, 165, 0.5], outline: { width: 0 } } },
                    { value: "21", label: "Suburban - Large",   symbol: { type: "simple-fill", color: [37, 99, 235, 0.5],   outline: { width: 0 } } },
                    { value: "22", label: "Suburban - Midsize", symbol: { type: "simple-fill", color: [96, 165, 250, 0.5],  outline: { width: 0 } } },
                    { value: "23", label: "Suburban - Small",   symbol: { type: "simple-fill", color: [147, 197, 253, 0.5], outline: { width: 0 } } },
                    { value: "31", label: "Town - Fringe",      symbol: { type: "simple-fill", color: [234, 179, 8, 0.5],   outline: { width: 0 } } },
                    { value: "32", label: "Town - Distant",     symbol: { type: "simple-fill", color: [253, 224, 71, 0.5],  outline: { width: 0 } } },
                    { value: "33", label: "Town - Remote",      symbol: { type: "simple-fill", color: [254, 240, 138, 0.5], outline: { width: 0 } } },
                    { value: "41", label: "Rural - Fringe",     symbol: { type: "simple-fill", color: [22, 163, 74, 0.5],   outline: { width: 0 } } },
                    { value: "42", label: "Rural - Distant",    symbol: { type: "simple-fill", color: [74, 222, 128, 0.5],  outline: { width: 0 } } },
                    { value: "43", label: "Rural - Remote",     symbol: { type: "simple-fill", color: [134, 239, 172, 0.5], outline: { width: 0 } } }
                ]
            },
            popupTemplate: {
                title: "Locale 2024",
                content: function (feature) {
                    const code = String(feature.graphic.attributes.LOCALE);
                    const localeMap = {
                        "11": { color: "#dc2626", text: "City, Large" },
                        "12": { color: "#f87171", text: "City, Midsize" },
                        "13": { color: "#fca5a5", text: "City, Small" },
                        "21": { color: "#2563eb", text: "Suburban, Large" },
                        "22": { color: "#60a5fa", text: "Suburban, Midsize" },
                        "23": { color: "#93c5fd", text: "Suburban, Small" },
                        "31": { color: "#eab308", text: "Town, Fringe" },
                        "32": { color: "#fde047", text: "Town, Distant" },
                        "33": { color: "#fef08a", text: "Town, Remote" },
                        "41": { color: "#16a34a", text: "Rural, Fringe" },
                        "42": { color: "#4ade80", text: "Rural, Distant" },
                        "43": { color: "#86efac", text: "Rural, Remote" }
                    };
                    
                    const info = localeMap[code] || { color: "#ccc", text: "Unknown" };
                    
                    return `
                        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 16px; padding: 5px 0;">
                            <span style="display:inline-block; width:24px; height:24px; background-color:${info.color}; margin-right:12px; vertical-align:middle; border: 1px solid #666;"></span>
                            <span style="font-weight: bold; font-size: 20px; margin-right: 6px;">${code}</span> 
                            <span style="color: #333;">${info.text}</span>
                        </div>
                    `;
                }
            }
        });

        await localeLayer.load();
        
        // Force it off right before adding just to be double sure
        localeLayer.visible = false; 
        view.map.add(localeLayer);

        // -------------------------------------------------------------
        // RENDER LAYERS PANEL
        // -------------------------------------------------------------
        layersList.innerHTML = "";
        
        function addLayers(collection, container, level = 0) {
            collection.forEach(layer => {
                const item = document.createElement("div");
                item.className = "layer-item";

                const row = document.createElement("div");
                row.className = "layer-row";

                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                
                // Force all checkboxes to be false on load
                checkbox.checked = false; 
                
                checkbox.addEventListener("change", () => { 
                    layer.visible = checkbox.checked; 
                    
                    // Show/Hide legend STRICTLY based on manual click
                    if (layer.title === "Locale Lookup (NCES)") {
                        if (customLegend) {
                            customLegend.style.display = checkbox.checked ? "flex" : "none";
                        }
                    }
                });

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
        document.getElementById("layerCount").textContent = `${view.map.allLayers.length}`;

        document.getElementById("searchLayer").addEventListener("input", function () {
            const query = this.value.toLowerCase();
            const items = layersList.querySelectorAll(".layer-item");

            items.forEach(item => {
                const nameSpan = item.querySelector(".layer-name");
                if (nameSpan) {
                    const layerName = nameSpan.textContent.toLowerCase();
                    item.style.display = layerName.includes(query) ? "block" : "none";
                }
            });
        });

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
                        symbol: { type: "simple-fill", color: [23, 54, 93, 0.3], outline: { color: [23, 54, 93], width: 3 } }
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
                    if (!parcelLayer.visible) {
                        parcelLayer.visible = true;
                    }
                    
                    clearHighlight();
                    view.graphics.add(new Graphic({
                        geometry: feature.geometry,
                        symbol: { type: "simple-fill", color: [23, 54, 93, 0.3], outline: { color: [23, 54, 93], width: 3 } }
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

initPasswordProtection();