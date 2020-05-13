
let createChoropleth = function() {
	// All the different types of weapon categories, and the current category (defaults to all)
	const categories = ["all", "aircraft", "air defense system", "artillery", "armoured vehicles", "engines", "sensors", "missiles", "naval weapons", "ships", "other"]
	var currCategory = "all";

	// Necessary Files. Using a world map as the basemap
	const files = {
		basemap: "../data/world_map.geojson",
		data: "../data/condensed_data.csv"
	};


	const svg = d3.select("body").select("svg#vis");

	const g = {
		basemap: svg.select("g#basemap"),
		outline: svg.select("g#outline"),
		details: svg.select("g#details"),
		legend:  svg.select("g#legend"),
	};

	// add details on demand elements
	const details = g.details.append("foreignObject")
		.attr("id", "details")
		.attr("width", 400)
		.attr("height", 250)
		.attr("dx", -5)
		.attr("dy", -5)
		.attr("x", 0)
		.attr("y", 0);

	const body = details.append("xhtml:body")
		.html(`<svg width="400" height="200" id="nested_vis"></svg>`);

	details.style("visibility", "hidden");

	// setup projection
	const projection = d3.geoMercator();

	// setup path, the delivery counts, and color scale
	const deliveryCounts = d3.map();
	deliveryCounts.set("all", d3.map());
	deliveryCounts.get("all").set("raw_count", d3.map());

	const path = d3.geoPath()
		.projection(projection);
	
	const color = d3.scaleQuantile()
	    .range(d3.schemeOrRd[7]);


	// Load the vehicle data
	d3.csv(files.data, cleanData).then(function(data) {

		// get the count of weapons deals for each country and each category
			// Need the data in two different formats, a raw count to display on the map, and broken down details, for the nested viz
			// Technicall we could always compute raw_count when needed, but this is much easier
		for(d of data){
			var category = d.category;
			var recipient = d.recipient;
			var delivery_year = d.year_delivered;

			if (! deliveryCounts.has(category)){
				deliveryCounts.set(category, d3.map());
			}

			if (! deliveryCounts.get(category).has("raw_count")){
				deliveryCounts.get(category).set("raw_count", d3.map());
			}

			if (! deliveryCounts.get(category).has(recipient)){
				deliveryCounts.get(category).set(recipient, d3.map());
			}

			if (! deliveryCounts.get(category).get(recipient).has(delivery_year)){
				deliveryCounts.get(category).get(recipient).set(delivery_year, 0);
			}

			if (! deliveryCounts.get(category).get("raw_count").has(recipient)){
				deliveryCounts.get(category).get("raw_count").set(recipient, 0);
			}

			//Also need to keep a total of all categories
			if (! deliveryCounts.get("all").has(recipient)){
				deliveryCounts.get("all").set(recipient, d3.map());
			}

			if (! deliveryCounts.get("all").get(recipient).has(delivery_year)){
				deliveryCounts.get("all").get(recipient).set(delivery_year, 0);
			}

			if (! deliveryCounts.get("all").get("raw_count").has(recipient)){
				deliveryCounts.get("all").get("raw_count").set(recipient, 0);
			}

			deliveryCounts.get("all").get(recipient).set(delivery_year, deliveryCounts.get("all").get(recipient).get(delivery_year) + 1);
			deliveryCounts.get(category).get(recipient).set(delivery_year, deliveryCounts.get(category).get(recipient).get(delivery_year) + 1);
			
			deliveryCounts.get("all").get("raw_count").set(recipient, deliveryCounts.get("all").get("raw_count").get(recipient) + 1);
			deliveryCounts.get(category).get("raw_count").set(recipient, deliveryCounts.get(category).get("raw_count").get(recipient) + 1);


		}

		console.log("complex data", deliveryCounts);

		// set the color range to that count
		color.domain([0, d3.max(deliveryCounts.get(currCategory).get("raw_count").values())]);

		// Load map data, and call the draw function
		d3.json(files.basemap).then(drawMap);

		// Finally, draw the legend
		// NOTE: I chose not to do this, because I wasn't sure it would update when the the map was filtered.
		// drawLegend(color)
	});

	function drawMap(json) {
		console.log("basemap", json);

		// makes sure to adjust projection to fit all of our regions
		projection.fitSize([960, 600], json);

		//Draw base map
		const basemap = g.basemap.selectAll("path.land")
			.data(json.features)
			.enter()
			.append("path")
			.attr("d", path)
			.attr("fill", function(d){
				let country = d.properties.name;

				if (deliveryCounts.get(currCategory).get("raw_count").has(country)){
					return color(deliveryCounts.get(currCategory).get("raw_count").get(country));
				}

				// console.log(country);
				return "#F5F5F5";
			})
			.attr("class", "land");

		// Draw the outline
		const outline = g.outline.selectAll("path.country")
				.data(json.features)
				.enter()
				.append("path")
				.attr("d", path)
				.attr("class", "country")
				.each(function(d) {
					// save selection in data for interactivity
					// saves search time finding the right outline later
					d.properties.outline = this;
				});

		// add highlight
		basemap.on("mouseover.highlight", function(d) {
			d3.select(d.properties.outline).raise();
			d3.select(d.properties.outline).classed("active", true);
		});

		basemap.on("mouseout.highlight", function(d) {
			d3.select(d.properties.outline).classed("active", false);
		});
		

		//Add details on demand
		basemap.on("mouseover.details", function(d) {

			// Update the HTML, to include the coutry's name
			// Also clears any previous details
			const html = `
				<div class="details">
					<h1>${d.properties.name}</h1>
					<svg width="400" height="200" id="nested_vis"></svg>
				</div>
			`;

			body.html(html);

			// Clear what was there before
			var nested_svg = d3.select("svg#nested_vis");

			// get the relevant data
			let nested_data = deliveryCounts.get(currCategory).get(d.properties.name)

			// No data for this country, so no details
			if (!nested_data || nested_data.keys().length == 1){
				return;
			}

			// Generate the new nested_viz

			var x = d3.scaleLinear()
				.domain([2000, 2020])
				.range([ 0, 350]);

			nested_svg.append("g")
				.attr("transform", translate(30, 175))
				.call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d")));

			var y = d3.scaleLinear()
				.domain([0, d3.max(nested_data.values())])
				.range([ 170, 0 ]);

			nested_svg.append("g")
				.attr("transform", translate(30, 5))
				.call(d3.axisLeft(y).ticks(4));

			nested_svg.append("path")
				.datum(nested_data.keys().sort())
				.attr("transform", translate(30, 0))
				.attr("fill", "none")
				.attr("stroke", "Chocolate")
				.attr("stroke-width", 1.5)
				.attr("d", function(d_local) {
					return d3.line()
						.x(d_last => x(d_last))
						.y(d_last => y(nested_data.get(d_last)))(d_local);
				});

			// Set it's position, and make it visible
			const coords = d3.mouse(g.basemap.node());
			details.attr("x", coords[0]);
			details.attr("y", coords[1]);
			details.style("visibility", "visible");

		});

		basemap.on("mousemove.details", function(d) {
			const coords = d3.mouse(g.basemap.node());
			details.attr("x", coords[0]);
			details.attr("y", coords[1]);
		})

		basemap.on("mouseout.details", function(d) {
			details.style("visibility", "hidden");
		});

		// Add filtering
		d3.select("#selectButton").on("change", function(d) {
			// recover the option that has been chosen
			var selectedOption = d3.select(this).property("value")

			currCategory = selectedOption;

			color.domain([0, d3.max(deliveryCounts.get(currCategory).get("raw_count").values())]);

			d3.selectAll("path.land")
				.transition()
				.duration(1000)
				.style("fill", function(d){
					let country = d.properties.name;

					if (deliveryCounts.get(currCategory).get("raw_count").has(country)){
						return color(deliveryCounts.get(currCategory).get("raw_count").get(country));
					}

					return "#F5F5F5";
				})
		})
	}

	function drawLegend(colorScale) {

		var legend = d3.legendColor()
			.scale(colorScale)
			.labelFormat(d3.format(".0f"))
			.useClass(true)
			.orient('horizontal')
			.shapeWidth(66)
			.title("Color Legend")
			.labelDelimiter(" - ");

		g.legend
			.attr("transform", translate(0, 20))
			.call(legend);

		// Need to actually update the color for some reason
		g.legend.selectAll("rect")
			.each(function(d){
				d3.select(this).style("fill", d)
			})

		g.legend.selectAll("text")
			.style("font-size", "small")

	}
		

};


//Helper functions, to make life easier

let cleanData = function(d){
	// This function does a little extra cleaning on the data
	let res = {
		"category": d["category"],
		"recipient": d["recipient"]
	}

	var year;

	if (d["year delivered"].includes("-")) {
		year = d["year delivered"].substring(d["year delivered"].indexOf("-")+1)
	}
	else {
		year = d["year delivered"]
	}

	res["year_delivered"] = year

	return res;
}

let translate = function(x, y) {
	return 'translate(' + x + ',' + y + ')';
};