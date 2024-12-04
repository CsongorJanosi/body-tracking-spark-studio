const Scene = require('Scene');
const BodyTracking = require('BodyTracking');
const Reactive = require('Reactive');
const Time = require('Time');
const Diagnostics = require('Diagnostics');

// Hip and Knee Y-Positions
const leftHip = BodyTracking.body(0).pose2D.torso.leftHip;
const rightHip = BodyTracking.body(0).pose2D.torso.rightHip;
const leftKnee = BodyTracking.body(0).pose2D.leftLeg.knee;
const rightKnee = BodyTracking.body(0).pose2D.rightLeg.knee;
const leftAnkle = BodyTracking.body(0).pose2D.leftLeg.ankle;
const rightAnkle = BodyTracking.body(0).pose2D.rightLeg.ankle;
const head = BodyTracking.body(0).pose2D.head.topHead;

// Y coordinates
const leftHipY = leftHip.keyPoint.y;
const rightHipY = rightHip.keyPoint.y;
const leftKneeY = leftKnee.keyPoint.y;
const rightKneeY = rightKnee.keyPoint.y;
const leftAnkleY = leftAnkle.keyPoint.y;
const rightAnkleY = rightAnkle.keyPoint.y;
const headY = head.keyPoint.y;

// smooth the values
const smoothFactor = 100;
const leftHipYSmoothed = leftHipY.expSmooth(smoothFactor);
const rightHipYSmoothed = rightHipY.expSmooth(smoothFactor);
const leftKneeYSmoothed = leftKneeY.expSmooth(smoothFactor);
const rightKneeYSmoothed = rightKneeY.expSmooth(smoothFactor);
const leftAnkleYSmoothed = leftAnkleY.expSmooth(smoothFactor);
const rightAnkleYSmoothed = rightAnkleY.expSmooth(smoothFactor);
const headYSmoothed = headY.expSmooth(smoothFactor);

// Average Y-positions
const hipYSum = leftHipYSmoothed.add(rightHipYSmoothed);
const hipYAverage = hipYSum.div(2);
const kneeYSum = leftKneeYSmoothed.add(rightKneeYSmoothed);
const kneeYAverage = kneeYSum.div(2);
const ankleYSum = leftAnkleYSmoothed.add(rightAnkleYSmoothed);
const ankleYAverage = ankleYSum.div(2);

// Difference between hip and knee Y-positions
const hipKneeYDiff = kneeYAverage.sub(hipYAverage);
const headAnkleYDiff = ankleYAverage.sub(headYSmoothed);

let squatCounter = 0;

// Set default minimum value to count a squat
const defaultMinValueToCountSquat  = 0.15;
const topRangeOfHipKneeYDiff = [];
function calculateMinValueToCountSquat() {
  let minValueToCountSquat;

  // average of the top 10 values 
  if (topRangeOfHipKneeYDiff.length < 10) {
    const hipKneeYDiffRounded = hipKneeYDiff.pinLastValue().toFixed(4);
    topRangeOfHipKneeYDiff.push(parseFloat(hipKneeYDiffRounded));
  } else if (topRangeOfHipKneeYDiff.length === 10) {
    // If there are any outliers replace the outlier furthest from the median top 10 values and add the current value
    const minValue = Math.min(...topRangeOfHipKneeYDiff);
    const maxValue = Math.max(...topRangeOfHipKneeYDiff);
    const range = maxValue - minValue;
    const upperBound = maxValue + 1.5 * range;
    const lowerBound = minValue - 1.5 * range;
    
    const outliers = topRangeOfHipKneeYDiff.filter(value => value < lowerBound || value > upperBound);
    if (outliers.length > 0) {
      // Replace the outlier furthest from the median with the current value
      const median = topRangeOfHipKneeYDiff.sort()[Math.floor(topRangeOfHipKneeYDiff.length / 2)];
      const outlier = outliers.sort((a, b) => Math.abs(a - median) - Math.abs(b - median))[0];
      const outlierIndex = topRangeOfHipKneeYDiff.indexOf(outlier);
      topRangeOfHipKneeYDiff[outlierIndex] = hipKneeYDiff.pinLastValue();
    } else {
      // No outliers, replace the minimum value
      const minValueIndex = topRangeOfHipKneeYDiff.indexOf(minValue);
      topRangeOfHipKneeYDiff[minValueIndex] = hipKneeYDiff.pinLastValue();
    }   
  }

  // Average of top 10 values
  const topRangeOfHipKneeYDiffSum = topRangeOfHipKneeYDiff.reduce((a, b) => a + b, 0);
  minValueToCountSquat = topRangeOfHipKneeYDiffSum / topRangeOfHipKneeYDiff.length;
  // Add error margin to min value
  minValueToCountSquat -= 0.015;

  // Fall back to the default value if the calculation fails or the value is too low or too high
  const falllbackTopRange = defaultMinValueToCountSquat + 0.1;
  const falllbackBottomRange = defaultMinValueToCountSquat - 0.05;
  if (!minValueToCountSquat || 
      minValueToCountSquat < falllbackBottomRange || 
      minValueToCountSquat > falllbackTopRange
    ) {
    minValueToCountSquat = defaultMinValueToCountSquat;
  }
  return minValueToCountSquat;
}


Promise.all([
  Scene.root.findFirst('2dText0'),
]).then(function (objects) {
  const [squatCounterText] = objects;

  let isSquatting = hipKneeYDiff.gt(defaultMinValueToCountSquat);
  hipKneeYDiff.monitor().subscribe(() => {
    // If the percentage of hip-knee difference of the ankle-head difference is greater than the minimum value count a squat
    const minValueToCountSquat = calculateMinValueToCountSquat();
    const hipKneePercentageOfHeadAnkle = hipKneeYDiff.div(headAnkleYDiff);
    isSquatting = hipKneePercentageOfHeadAnkle.gt(minValueToCountSquat).pinLastValue();
  });

  isSquatting.monitor().subscribe(function (e) {
    if (e.newValue) {
      squatCounter++;
      squatCounterText.text = squatCounter.toString();
      Diagnostics.log(`Squat Detected! Total Squats: ${squatCounter}`);
    }
  });
});
