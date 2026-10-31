
const webmapId = "3eba42e174e54fafafc4d63a9b4b703e";

async function initializeMap() {

    try {

        const [WebMap, MapView] = await $arcgis.import([
            "@arcgis/core/WebMap.js",
            "@arcgis/core/views/MapView.js"
        ]);

        const webmap = new WebMap({
            portalItem: {
                id: webmapId
            }
        });

        const view = new MapView({
            container: "viewDiv",
            map: webmap
        });

        await view.when();

        const layersList = document.getElementById("layersList");
        const layerCount = document.getElementById("layerCount");

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

                checkbox.addEventListener("change", () => {
                    layer.visible = checkbox.checked;
                });

                const name = document.createElement("span");
                name.className = "layer-name";
                name.textContent = layer.title || "Untitled Layer";

                const expand = document.createElement("button");
                expand.className = "expand-btn";
                expand.textContent = "⌄";
                expand.title = "Show layer details";

                const details = document.createElement("div");
                details.className = "layer-details";

                details.textContent =
                    `Type: ${layer.type || "Unknown"} | ID: ${layer.id}`;

                expand.addEventListener("click", () => {
                    details.classList.toggle("open");
                    expand.textContent =
                        details.classList.contains("open") ? "⌃" : "⌄";
                });

                row.style.paddingLeft = `${12 + level * 18}px`;

                row.appendChild(checkbox);
                row.appendChild(name);
                row.appendChild(expand);

                item.appendChild(row);
                item.appendChild(details);

                container.appendChild(item);

                // Nested layers
                if (layer.layers && layer.layers.length > 0) {
                    addLayers(layer.layers, item, level + 1);
                }

                if (layer.sublayers && layer.sublayers.length > 0) {
                    addLayers(layer.sublayers, item, level + 1);
                }

            });

        }

        addLayers(webmap.layers, layersList);

        layerCount.textContent =
            `${webmap.allLayers.length} Layers`;

        // Search layers
        document.getElementById("searchLayer")
            .addEventListener("input", function () {

                const search = this.value.toLowerCase();

                document.querySelectorAll(".layer-item").forEach(item => {

                    const name = item.querySelector(".layer-name")
                        .textContent.toLowerCase();

                    item.style.display =
                        name.includes(search) ? "" : "none";

                });

            });

        console.log("Web Map loaded!");
        console.log("All layers:", webmap.allLayers);

    } catch (error) {

        console.error("Error loading map:", error);

        document.getElementById("layersList").textContent =
            "Unable to load layers. Check console and Web Map permissions.";

    }

}

initializeMap();
