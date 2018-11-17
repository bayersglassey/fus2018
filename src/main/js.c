

#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#include <emscripten.h>

#include "../includes.h"


EMSCRIPTEN_KEEPALIVE
fus_t *fus_new(){
    fus_t *fus = malloc(sizeof(*fus));
    fus_init(fus);
    return fus;
}

EMSCRIPTEN_KEEPALIVE
fus_vm_t *fus_get_vm(fus_t *fus){
    return &fus->vm;
}

EMSCRIPTEN_KEEPALIVE
fus_runner_t *fus_get_runner(fus_t *fus){
    return &fus->runner;
}

EMSCRIPTEN_KEEPALIVE
int fus_run(fus_t *fus, const char *text){

    fus_lexer_t *lexer = &fus->lexer;
    fus_lexer_load_chunk(lexer, text, strlen(text) + 1);

    fus_runner_t *runner = &fus->runner;
    if(fus_runner_exec_lexer(runner, lexer, false) < 0)return -1;

    if(!fus_lexer_is_done(lexer)){
        fus_lexer_perror(lexer, "Lexer finished with status != done");
        return -1;
    }

    return 0;
}

EMSCRIPTEN_KEEPALIVE
int exec(const char *text){
    fus_t fus;
    fus_init(&fus);
    int status = fus_run(&fus, text);
    fus_cleanup(&fus);
    return status;
}

int main(int n_args, char *args[]){
    printf("OK.\n");
    return EXIT_SUCCESS;
}

