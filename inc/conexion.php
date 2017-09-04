<?php
	require_once('php-riot-api.php');
	require_once('FileSystemCache.php');

	$region = "euw1";
	if(!empty($_GET["region"])){
		$region = $_GET["region"];
	}

	$api = new riotapi($region, new FileSystemCache('../cache/'));
?>
