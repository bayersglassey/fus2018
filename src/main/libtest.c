
#include <stdio.h>
#include <stdlib.h>

#include <fus/includes.h>


static int test(fus_t *fus){
    const char *text =
        "arr 1, 2,\n"
        "pop swap pop nip +\n"
        "\"The answer is three: \" swap";

    fus_lexer_t *lexer = &fus->lexer;
    fus_runner_t *runner = &fus->runner;

    fus_lexer_load_chunk(lexer, text, strlen(text) + 1);
    if(fus_runner_exec_lexer(runner, lexer, NULL, false) < 0)return -1;
    fus_runner_dump_state(runner, stdout, "dvs");

    if(!fus_lexer_is_done(lexer)){
        fus_lexer_perror(lexer, "Lexer finished with status != done");
        return -1;
    }

    return 0;
}


int main(int n_args, char *args[]){
    int status = EXIT_SUCCESS;

    fus_t fus;
    fus_init(&fus);
    if(test(&fus) < 0)goto err;

    printf("OK\n");
err:
    fus_cleanup(&fus);
    return EXIT_SUCCESS;
}

