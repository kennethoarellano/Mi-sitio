document.addEventListener("DOMContentLoaded", () => {
    let co2Data = [];
    const select = document.getElementById("country-select");
    const yearSlider = document.getElementById("year-slider");
    const yearLabel = document.getElementById("year-label");

    const geojsonToCsvNameMap = {
        "United States of America": "United States",
        "Russian Federation": "Russia",
        "Viet Nam": "Vietnam",
        "Democratic Republic of the Congo": "Democratic Republic of Congo",
        "Iran (Islamic Republic of)": "Iran",
        "Republic of Korea": "South Korea",
        "Czechia": "Czech Republic",
        "Slovakia": "Slovak Republic",
        "United Kingdom": "United Kingdom"
    };

    d3.csv("co2_clean.csv").then(data => {
        co2Data = data.map(d => ({
            country: d.country,
            iso_code: d.iso_code,
            year: +d.year || 0,
            co2: +d.co2 || 0,
            co2_per_capita: +d.co2_per_capita || 0,
            coal_co2: +d.coal_co2 || 0,
            oil_co2: +d.oil_co2 || 0,
            gas_co2: +d.gas_co2 || 0,
            gdp: +d.gdp || 0,
            population: +d.population || 0,
            predicted: +d.predicted || 0
        }));

        const uniqueCountries = [...new Set(co2Data.map(d => d.country))].sort();
        uniqueCountries.forEach(country => {
            const opt = new Option(country, country);
            select.appendChild(opt);
        });

        ["Colombia", "United States", "China"].forEach(c => {
            const option = [...select.options].find(o => o.value === c);
            if (option) option.selected = true;
        });

        plotLineChart(co2Data, getSelectedCountries());
        plotBarChart(co2Data, +yearSlider.value);

        select.addEventListener("change", () => plotLineChart(co2Data, getSelectedCountries()));
        yearSlider.addEventListener("input", () => {
            yearLabel.textContent = yearSlider.value;
            plotBarChart(co2Data, +yearSlider.value);
        });

        initMap();
    }).catch(error => {
        console.error("Error loading CSV data:", error);
        alert("No se pudo cargar el archivo de datos CO2.");
    });

    function getSelectedCountries() {
        return [...select.selectedOptions].map(o => o.value);
    }

    function plotLineChart(data, countries) {
        if (!countries.length) return Plotly.purge("line-chart");

        const traces = countries.flatMap(country => {
            const countryData = data.filter(d => d.country === country);
            const realData = countryData.filter(d => d.predicted === 0);
            const predictedData = countryData.filter(d => d.predicted === 1);

            const traceReal = {
                x: realData.map(d => d.year),
                y: realData.map(d => d.co2),
                mode: "lines+markers",
                name: `${country} (Real)`,
                line: { color: "blue" }
            };

            if (!predictedData.length) return [traceReal];

            const lastReal = realData.at(-1);
            const predictedX = lastReal ? [lastReal.year, ...predictedData.map(d => d.year)] : predictedData.map(d => d.year);
            const predictedY = lastReal ? [lastReal.co2, ...predictedData.map(d => d.co2)] : predictedData.map(d => d.co2);

            const tracePred = {
                x: predictedX,
                y: predictedY,
                mode: "lines+markers",
                name: `${country} (Predicción)`,
                line: { dash: "dot", color: "red" }
            };

            return [traceReal, tracePred];
        });

        Plotly.newPlot("line-chart", traces, {
            title: "Evolución de las Emisiones de CO₂",
            xaxis: { title: "Año" },
            yaxis: { title: "Emisiones de CO₂ (toneladas)" },
            margin: { t: 50, r: 30, l: 50, b: 50 }
        }, { responsive: true });
    }

    function plotBarChart(data, year) {
        const yearData = data.filter(d => d.year === year && d.predicted === 0)
            .sort((a, b) => b.co2 - a.co2)
            .slice(0, 20);

        const trace = {
            x: yearData.map(d => d.country),
            y: yearData.map(d => d.co2),
            type: 'bar',
            marker: { color: '#1f77b4' }
        };

        Plotly.newPlot("bar-chart", [trace], {
            title: `Emisiones Totales de CO₂ en ${year} (Top 20 países)`,
            xaxis: { title: "País", tickangle: -45, automargin: true },
            yaxis: { title: "Emisiones de CO₂ (toneladas)" },
            margin: { t: 50, r: 30, l: 50, b: 150 },
            height: 450
        }, { responsive: true });
    }

    function initMap() {
        const map = L.map('map').setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 7,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        d3.json("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json").then(geojsonData => {
            geojsonData.features.forEach(feature => {
                const geoName = feature.properties.name;
                const csvName = geojsonToCsvNameMap[geoName] || geoName;
                feature.properties.co2Data = co2Data.filter(d => d.country === csvName);
            });

            L.geoJSON(geojsonData, {
                style: feature => {
                    const year = 2020;
                    const dataYear = feature.properties.co2Data.find(d => d.year === year);
                    const co2 = dataYear ? dataYear.co2 : 0;

                    return {
                        fillColor: getColor(co2),
                        weight: 1,
                        color: 'white',
                        fillOpacity: 0.7,
                        opacity: 1
                    };
                },
                onEachFeature: (feature, layer) => {
                    layer.bindTooltip(feature.properties.name, { sticky: true });
                    layer.on({
                        mouseover: () => layer.setStyle({ weight: 3, color: '#003355', fillOpacity: 0.8 }),
                        mouseout: () => layer.setStyle({ weight: 1, color: 'white', fillOpacity: 0.7 }),
                        click: () => showCountryInfo(feature.properties)
                    });
                }
            }).addTo(map);
        }).catch(err => {
            console.error("Error loading GeoJSON:", err);
            alert("Error al cargar el mapa de países.");
        });

        function getColor(d) {
            return d > 1e9 ? '#800026' :
                d > 5e8 ? '#BD0026' :
                    d > 1e8 ? '#E31A1C' :
                        d > 5e7 ? '#FC4E2A' :
                            d > 1e7 ? '#FD8D3C' :
                                d > 5e6 ? '#FEB24C' :
                                    d > 1e6 ? '#FED976' :
                                        '#FFEDA0';
        }
    }

    function showCountryInfo(properties) {
        const infoDiv = document.getElementById("country-info");
        const data = properties.co2Data;
        if (!data || !data.length) {
            infoDiv.style.display = "none";
            return;
        }

        const latestYear = Math.max(...data.map(d => d.year));
        const latestData = data.find(d => d.year === latestYear);
        const iso = (data.find(d => d.iso_code?.length === 3) || {}).iso_code;
        const flagUrl = iso ? `https://flagcdn.com/w80/${iso.toLowerCase()}.png` : "";

        infoDiv.innerHTML = `
            <h3>${properties.name} (${latestYear})</h3>
            ${flagUrl ? `<img src="${flagUrl}" alt="Bandera de ${properties.name}" onerror="this.style.display='none'"/>` : ""}
            <p><strong>Emisiones totales CO₂:</strong> ${latestData.co2.toLocaleString()} toneladas</p>
            <p><strong>Emisiones per cápita CO₂:</strong> ${latestData.co2_per_capita.toFixed(2)}</p>
            <p><strong>Emisiones por carbón:</strong> ${latestData.coal_co2.toLocaleString()} toneladas</p>
            <p><strong>Emisiones por petróleo:</strong> ${latestData.oil_co2.toLocaleString()} toneladas</p>
            <p><strong>Emisiones por gas:</strong> ${latestData.gas_co2.toLocaleString()} toneladas</p>
            <p><strong>Población:</strong> ${latestData.population.toLocaleString()}</p>
        `;
        infoDiv.style.display = "block";

        plotProjectionChart(data);
    }

    function plotProjectionChart(data) {
        const recent = data.filter(d => d.year >= 2010 && d.co2 > 0).sort((a, b) => a.year - b.year);
        if (recent.length < 2) {
            document.getElementById("country-projection-chart").innerHTML = "";
            return;
        }

        const years = recent.map(d => d.year);
        const co2s = recent.map(d => d.co2);
        const n = years.length;
        const avgX = years.reduce((a, b) => a + b) / n;
        const avgY = co2s.reduce((a, b) => a + b) / n;

        const slope = years.reduce((acc, x, i) => acc + (x - avgX) * (co2s[i] - avgY), 0) /
            years.reduce((acc, x) => acc + (x - avgX) ** 2, 0);
        const intercept = avgY - slope * avgX;

        const lastYear = years.at(-1);
        const futureYears = d3.range(lastYear + 1, lastYear + 11);
        const futureCo2 = futureYears.map(y => Math.max(0, slope * y + intercept));

        Plotly.newPlot("country-projection-chart", [
            {
                x: years,
                y: co2s,
                mode: "lines+markers",
                name: "Datos reales",
                line: { color: "blue" }
            },
            {
                x: [lastYear, ...futureYears],
                y: [co2s.at(-1), ...futureCo2],
                mode: "lines+markers",
                name: "Proyección",
                line: { dash: "dot", color: "orange" }
            }
        ], {
            title: `Proyección Emisiones CO₂ para ${data[0].country}`,
            xaxis: { title: "Año" },
            yaxis: { title: "Emisiones CO₂ (toneladas)" },
            margin: { t: 50, r: 30, l: 50, b: 50 }
        }, { responsive: true });
    }
});
