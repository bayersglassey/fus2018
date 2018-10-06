
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#include "value.h"



int main(int n_args, char *args[]){
    char c = 'p';
    fus_value_t v[4];
    for(int i = 0; i < 4; i++){
        printf("%c %p\n", c, &v[i]);
    }

    printf("OK");
    return 0;
}

