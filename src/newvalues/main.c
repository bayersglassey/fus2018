
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#include "core.h"
#include "class.h"
#include "array.h"
#include "vm.h"
//#include "value.h"



int main(int n_args, char *args[]){
    int err;

    fus_core_t core;
    err = fus_core_init(&core);
    if(err){
        fprintf(stderr, "Couldn't init core\n");
        return EXIT_FAILURE;
    }

    fus_core_cleanup(&core);

    printf("OK\n");
    return 0;
}

