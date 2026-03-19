// === CONSTANTS ===

const SECTION_COLORS = {
    intro:        '#6366f1',
    verse:        '#3b82f6',
    'pre-chorus': '#06b6d4',
    chorus:       '#f59e0b',
    bridge:       '#ec4899',
    outro:        '#8b5cf6',
    instrumental: '#10b981',
    hook:         '#ef4444',
    breakdown:    '#f97316'
};

const SECTION_ORDER = [
    'intro', 'verse', 'pre-chorus', 'chorus',
    'hook', 'bridge', 'instrumental', 'breakdown', 'outro'
];

const DECADES = ['All', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

const margin = { top: 30, right: 20, bottom: 30, left: 220 };
const ROW_HEIGHT = 32;
const ROW_GAP = 4;
const BAR_HEIGHT = 22;

// === STATE ===

let allSongs = [];
let currentDecade = 'All';
let highlightSection = null;

// === LOAD & PARSE DATA ===

d3.csv('data/songs.csv').then(raw => {
    allSongs = raw.map(d => {
        const sections = JSON.parse(d.sections);
        const duration = +d.duration_sec;
        const firstChorus = sections.find(s => s.type === 'chorus' || s.type === 'hook');
        return {
            title: d.title,
            artist: d.artist,
            year: +d.year,
            decade: d.decade,
            genre: d.genre,
            duration,
            sections,
            firstChorusTime: firstChorus ? firstChorus.start : duration
        };
    });

    buildDecadeButtons();
    buildLegend();
    render();
});

// === DECADE FILTER BUTTONS ===

function buildDecadeButtons() {
    const container = d3.select('#decade-buttons');

    container.selectAll('button')
        .data(DECADES)
        .join('button')
        .text(d => d)
        .classed('active', d => d === currentDecade)
        .on('click', (event, d) => {
            currentDecade = d;
            container.selectAll('button').classed('active', b => b === d);
            render();
        });
}

// === LEGEND (clickable to highlight a section type) ===

function buildLegend() {
    const legend = d3.select('#legend');

    const items = legend.selectAll('.legend-item')
        .data(SECTION_ORDER)
        .join('div')
        .attr('class', 'legend-item')
        .on('click', (event, d) => {
            // Toggle: click same section again to clear highlight
            highlightSection = (highlightSection === d) ? null : d;

            // Dim non-selected legend items
            legend.selectAll('.legend-item')
                .classed('dimmed', type => highlightSection && type !== highlightSection);

            // Dim non-selected bars in the chart
            d3.selectAll('.section-rect')
                .classed('dimmed', function () {
                    if (!highlightSection) return false;
                    return d3.select(this).attr('data-type') !== highlightSection;
                });
        });

    items.append('div')
        .attr('class', 'legend-swatch')
        .style('background', d => SECTION_COLORS[d]);

    items.append('span')
        .attr('class', 'legend-label')
        .text(d => d.replace('-', ' '));
}

// === MAIN RENDER ===

function render() {
    // Filter by decade
    const filtered = currentDecade === 'All'
        ? allSongs
        : allSongs.filter(d => d.decade === currentDecade);

    // Sort by year (default for first commit)
    const songs = [...filtered].sort((a, b) => a.year - b.year);

    drawChart(songs);
}

// === CHART DRAWING ===

function drawChart(songs) {
    const containerWidth = document.getElementById('chart-container').clientWidth;
    const innerWidth = containerWidth - margin.left - margin.right;
    const chartHeight = margin.top + songs.length * (ROW_HEIGHT + ROW_GAP) + margin.bottom;

    // Size the SVG
    const svg = d3.select('#chart')
        .attr('viewBox', `0 0 ${containerWidth} ${chartHeight}`)
        .attr('height', chartHeight);

    // X scale: seconds → pixels
    const maxDuration = d3.max(songs, d => d.duration) || 300;
    const xScale = d3.scaleLinear()
        .domain([0, maxDuration])
        .range([0, innerWidth]);

    // Root <g> translated by margins
    let g = svg.select('g.chart-group');
    if (g.empty()) {
        g = svg.append('g')
            .attr('class', 'chart-group')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);
    }

    // --- Time axis (top) ---
    let topAxis = g.select('.top-axis');
    if (topAxis.empty()) {
        topAxis = g.append('g').attr('class', 'time-axis top-axis');
    }
    topAxis.transition().duration(600).call(
        d3.axisTop(xScale).ticks(6).tickFormat(formatTime)
    );

    // --- Song rows (enter / update / exit) ---
    const rows = g.selectAll('.song-group')
        .data(songs, d => d.title + d.artist);

    // EXIT
    rows.exit()
        .transition().duration(300)
        .attr('opacity', 0)
        .remove();

    // ENTER
    const rowEnter = rows.enter()
        .append('g')
        .attr('class', 'song-group')
        .attr('transform', (d, i) => `translate(0, ${i * (ROW_HEIGHT + ROW_GAP) + 10})`)
        .attr('opacity', 0);

    // Song title label
    rowEnter.append('text')
        .attr('class', 'song-label-title')
        .attr('x', -8)
        .attr('y', BAR_HEIGHT / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'end')
        .text(d => truncateLabel(`${d.title} — ${d.artist}`, 30));

    // Section rectangles
    rowEnter.each(function (song) {
        const row = d3.select(this);
        song.sections.forEach(section => {
            row.append('rect')
                .attr('class', 'section-rect')
                .attr('data-type', section.type)
                .attr('x', xScale(section.start))
                .attr('y', 0)
                .attr('width', Math.max(0, xScale(section.end) - xScale(section.start) - 1))
                .attr('height', BAR_HEIGHT)
                .attr('rx', 3)
                .attr('fill', SECTION_COLORS[section.type] || '#555')
                .classed('dimmed', highlightSection && section.type !== highlightSection)
                .on('mouseenter', (event) => showTooltip(event, song, section))
                .on('mousemove', (event) => moveTooltip(event))
                .on('mouseleave', hideTooltip);
        });
    });

    // Animate entering rows
    rowEnter.transition()
        .duration(500)
        .delay((d, i) => i * 15)
        .attr('opacity', 1);

    // UPDATE — move existing rows to new positions
    rows.transition()
        .duration(600)
        .attr('transform', (d, i) => `translate(0, ${i * (ROW_HEIGHT + ROW_GAP) + 10})`)
        .attr('opacity', 1);

    // Update section rect widths (in case x scale changed)
    rows.each(function (song) {
        d3.select(this).selectAll('.section-rect').each(function (_, i) {
            if (i < song.sections.length) {
                const s = song.sections[i];
                d3.select(this)
                    .transition().duration(600)
                    .attr('x', xScale(s.start))
                    .attr('width', Math.max(0, xScale(s.end) - xScale(s.start) - 1));
            }
        });
    });

    // --- Time axis (bottom) ---
    let bottomAxis = g.select('.bottom-axis');
    if (bottomAxis.empty()) {
        bottomAxis = g.append('g').attr('class', 'time-axis bottom-axis');
    }
    bottomAxis
        .transition().duration(600)
        .attr('transform', `translate(0, ${songs.length * (ROW_HEIGHT + ROW_GAP) + 10})`)
        .call(d3.axisBottom(xScale).ticks(6).tickFormat(formatTime));
}

// === TOOLTIP ===

function showTooltip(event, song, section) {
    const dur = section.end - section.start;
    const pct = ((dur / song.duration) * 100).toFixed(1);

    d3.select('#tooltip')
        .html(`
            <div class="tt-title">${song.title}</div>
            <div class="tt-artist">${song.artist} (${song.year})</div>
            <div class="tt-section">
                <span class="tt-swatch" style="background:${SECTION_COLORS[section.type]}"></span>
                <strong>${section.type.replace('-', ' ')}</strong> · ${dur}s (${pct}%)
            </div>
            <div style="color:#8a8a8e; font-size:0.75rem; margin-top:3px">
                ${formatTime(section.start)} – ${formatTime(section.end)}
            </div>
        `)
        .style('opacity', 1);

    moveTooltip(event);
}

function moveTooltip(event) {
    const tt = d3.select('#tooltip').node();
    let x = event.clientX + 14;
    let y = event.clientY - 10;
    if (x + tt.offsetWidth > window.innerWidth - 10) x = event.clientX - tt.offsetWidth - 14;
    if (y + tt.offsetHeight > window.innerHeight - 10) y = event.clientY - tt.offsetHeight - 10;
    d3.select('#tooltip').style('left', x + 'px').style('top', y + 'px');
}

function hideTooltip() {
    d3.select('#tooltip').style('opacity', 0);
}

// === UTILITIES ===

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function truncateLabel(str, max) {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// === RESIZE HANDLER ===

window.addEventListener('resize', () => {
    if (allSongs.length) render();
});