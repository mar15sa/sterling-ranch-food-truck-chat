"use strict";
const path=require('node:path');
const {compare}=require('./compare-answer-assessment');
if(require.main===module)compare({outDir:path.resolve(process.argv[2]),kind:'acceptance',revision:'compact-v1',fixtures:require('./acceptance-fixtures'),capUsd:1})
  .catch(e=>{console.error(e.message);process.exitCode=1;});
