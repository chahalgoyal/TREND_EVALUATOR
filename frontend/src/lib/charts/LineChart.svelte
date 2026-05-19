<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler } from 'chart.js';

  Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

  interface LineChartDataset {
    label: string;
    data: number[];
    color: string;
    fill?: boolean;
  }

  let { labels, datasets, height = 280 } = $props<{
    labels: string[];
    datasets: LineChartDataset[];
    height?: number;
  }>();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  onMount(() => {
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map((ds: LineChartDataset) => ({
          label: ds.label,
          data: ds.data,
          borderColor: ds.color,
          backgroundColor: ds.fill ? ds.color + '15' : 'transparent',
          fill: ds.fill ?? false,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#151926',
          pointBorderColor: ds.color,
          pointBorderWidth: 2,
          pointHoverBackgroundColor: ds.color,
          borderWidth: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        layout: {
          padding: { top: 4, bottom: 4 }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#151926',
            titleColor: '#eaecf5',
            bodyColor: '#9298b4',
            borderColor: 'rgba(255,255,255,0.09)',
            borderWidth: 1,
            cornerRadius: 8,
            padding: { x: 12, y: 8 },
            titleFont: { family: 'Inter', weight: 600, size: 12 },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color: '#5d6380',
              font: { family: 'Inter', size: 10 },
              maxRotation: 45,
              padding: 4,
            },
            border: { display: false },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color: '#5d6380',
              font: { family: 'JetBrains Mono', size: 10 },
              padding: 8,
            },
            border: { display: false },
          },
        },
      },
    });

    return () => { chart?.destroy(); };
  });
</script>

<div class="chart-wrapper" style="height: {height}px">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .chart-wrapper {
    width: 100%;
  }
</style>
