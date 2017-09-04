var app = angular.module("myApp", ['ngRoute','angucomplete-alt']);
app.config(["$routeProvider", function($routeProvider) {
    $routeProvider
    .when("/about_us", {
        templateUrl : "mod/about_us.php"
    })
    .when("/contact", {
        templateUrl : "mod/contact.php"
    })
    .when("/services", {
        templateUrl : "mod/services.php"
    })

}]);

app.controller('MyCtrl', function($scope, $http, $location) {
    $scope.loading = true;
    $scope.requestSummoner = () => {
        //$url = "http://localhost:8887/matchList?summoner_name=" + $scope.summoner_name + "&region=" + $scope.region;
        //$url = "http://localhost:8887/currentGame?summonerId=31359375" + "&region=" + $scope.region;
        //$url = "http://localhost:8887/runes?summonerId=43050937" + "&region=" + $scope.region;
        //$url = "http://localhost:8887/masteries?summonerId=43050937" + "&region=" + $scope.region;
        //$url = "http://localhost:8887/champs-mastery?summonerId=43050937" + "&region=" + $scope.region;
        $url = "http://localhost:8887/champ-stats?accountId=201648193" + "&region=" + $scope.region;
        $http.get($url).then((res) => {
            //$scope.summonerId = res.data.summonerId;
            console.log(res.data)
            $scope.loading = false;
        }, (err) =>{
            console.log(err);
        })
    }
    $scope.isActive = function(route) {
        return route === $location.path();
    }
});

app.controller('ChampCtrl', ($scope,$http) => {
    $scope.Champs = [];
    $scope.SelectedChamp = null;

    //After select champ event
    $scope.afterSelectedChamp = (selected) => {
        if(selected){
            $scope.SelectedChamp = selected.originalObject;
        } else {
            alert("Asd")
        }
    }

    //Populate data from json
    $http.get('../json/champion.json').then((res) => {
        //$scope.Champs = res.data.data;
        for(let champ in res.data.data) {
            $scope.Champs.push(res.data.data[champ]);
        }
    }, (err) => console.log(err));
});